/**
 * 앱 셸 — 전체 배선.
 *   자율신경 채널: 웹캠 → capture(P1) → director(P2) → renderer(P3) / bridge(P5)
 *   대화 채널:    STT → persona(P4, Claude) → renderer + 자막 / bridge(P5)
 *   세션 모드(P6): 키오스크 풀스크린, 타이머(기본 13분), 종료 설문 → 로컬 JSON.
 *
 * 콘솔 로그 대신 화면 내 '행동 봉투' 패널에 기록한다 (규약).
 * 웹캠 프레임·음성은 저장/전송하지 않는다 — 신호와 텍스트만 남긴다.
 *
 * URL 파라미터: ?seed=  난수 시드 / ?min=  세션 길이(분) /
 *               ?stream=ws://host:8888  UE Pixel Streaming 시그널링 (없으면 클립뱅크)
 */
import { SignalCapture } from "./capture/signals";
import { MirrorDirector } from "./director/mirror";
import { mulberry32 } from "./director/rng";
import { ClipBankRenderer, type Renderer } from "./renderer/clipbank";
import { PixelStreamRenderer } from "./renderer/pixelstream";
import { respond, SECOND_PROFILE } from "./brain/persona";
import { startSTT, type STTHandle } from "./brain/stt";
import { BridgeClient } from "./net/bridge";
import { SignalOverlay } from "./ui/overlay";
import { TuningPanel } from "./ui/tuning";
import { showSurvey, saveSurvey } from "./ui/survey";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 20260703);
const durationMin = Math.min(15, Math.max(1, Number(params.get("min") ?? 13)));
const streamUrl = params.get("stream");

const stage = document.getElementById("stage")!;
const bodyEl = document.getElementById("body")!;
const caption = document.getElementById("caption")!;
const clock = document.getElementById("clock")!;
const envelope = document.getElementById("envelope")!;
const privacy = document.getElementById("privacy")!;
const begin = document.getElementById("begin") as HTMLButtonElement;

/** 행동 봉투 패널에 한 줄 기록 */
export function log(line: string) {
  const row = document.createElement("div");
  const t = document.createElement("span");
  t.className = "t";
  t.textContent = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  row.appendChild(t);
  row.appendChild(document.createTextNode(line));
  envelope.appendChild(row);
  while (envelope.children.length > 300) envelope.firstChild?.remove();
  envelope.scrollTop = envelope.scrollHeight;
}

/* ── 몸: PixelStream(전시 본선, ?stream=) → 죽으면 클립뱅크로 폴백 ── */
let renderer: Renderer = streamUrl
  ? new PixelStreamRenderer(bodyEl, streamUrl, () => {
      log("픽셀 스트림 끊김 — 클립뱅크로 폴백 (세컨은 죽지 않는다)");
      bodyEl.replaceChildren();
      renderer = makeClipBank();
    })
  : makeClipBank();

function makeClipBank(): Renderer {
  const r = new ClipBankRenderer(bodyEl, mulberry32(seed ^ 0x9e3779b9));
  r.setSpeakingListener((s) => director.setSpeaking(s));
  return r;
}

/* ── 브리지(P5): Envelope 를 허브로 publish — 없어도 세션은 계속된다 ── */
const bridge = new BridgeClient(undefined, log);
bridge.connect();

/* ── 디렉터(P2): 무시·지연·열화 게이팅 ── */
const mirrorNotes: string[] = []; // 최근 거울 이력 — 뇌 프롬프트에 주입
const director = new MirrorDirector({}, seed, {
  onMirror: (m) => {
    renderer.mirror(m);
    bridge.publish(m);
  },
  onDecision: (line) => log(line),
  onGazeHint: (g, reason) => {
    renderer.gaze(g);
    bridge.publish({ kind: "gaze", target: g });
    log(`시선 → ${g} (${reason})`);
  },
  onMemoryNote: (note) => {
    mirrorNotes.push(note);
    if (mirrorNotes.length > 3) mirrorNotes.shift();
  },
});
if (streamUrl) renderer.setSpeakingListener((s) => director.setSpeaking(s));

/* ── 이음새 조정(P2): 키 [t] ── */
const tuning = new TuningPanel(stage, (cfg) => {
  director.setConfig(cfg);
  log(`이음새 조정 — 상한 ${cfg.sessionCap}회, 전역 쿨다운 ${cfg.globalCooldownMs / 1000}s`);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "t" && !(e.target instanceof HTMLInputElement)) tuning.toggle();
});

/* ── 대화 채널(P4): STT → persona → 자막 + 몸 ── */
let thinking = false;
async function onUtterance(text: string) {
  if (thinking) return; // 생각 중엔 다음 발화를 받지 않는다 — 세컨은 서두르지 않는다
  thinking = true;
  log(`관객: "${text}"`);
  try {
    const action = await respond(text, SECOND_PROFILE, [], [...mirrorNotes]);
    // 자막은 즉시 시작 — 몸은 renderer 가 desync_ms 만큼 늦게 따라온다
    caption.textContent = action.say;
    renderer.perform(action);
    bridge.publish(action);
    log(`세컨: "${action.say}" (${action.emotion}, 시선 ${action.gaze})`);
    const ms = Math.max(1400, action.say.length * 145) + action.glitch.desync_ms;
    setTimeout(() => {
      if (caption.textContent === action.say) caption.textContent = "";
    }, ms + 1200);
  } finally {
    thinking = false;
  }
}

/* ── 캡처(P1): 웹캠 → SignalEvent. 프레임은 감지 즉시 버려진다 ── */
const overlay = new SignalOverlay(stage);
const camVideo = document.createElement("video");
Object.assign(camVideo, { muted: true, playsInline: true });
Object.assign(camVideo.style, {
  position: "absolute", width: "1px", height: "1px", opacity: "0", pointerEvents: "none",
});
stage.appendChild(camVideo);

async function startCapture(): Promise<SignalCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 }, audio: false,
  });
  camVideo.srcObject = stream;
  await camVideo.play();
  const capture = new SignalCapture(camVideo, (s) => {
    overlay.note(s);
    director.ingest(s);
  });
  log("감지 모델 로딩 중…");
  await capture.init();
  capture.start();
  log("캡처 시작 — ~15fps, 신호만 남는다");
  return capture;
}

/* ── 세션 모드(P6): 타이머 → 종료 → 설문 → 로컬 저장 ── */
let capture: SignalCapture | null = null;
let stt: STTHandle | null = null;

function startTimer() {
  const endAt = Date.now() + durationMin * 60_000;
  const iv = setInterval(() => {
    const left = endAt - Date.now();
    if (left <= 0) {
      clearInterval(iv);
      clock.textContent = "";
      void endSession();
      return;
    }
    const m = Math.floor(left / 60_000);
    const s = Math.floor((left % 60_000) / 1000);
    clock.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }, 1000);
}

async function endSession() {
  capture?.stop();
  stt?.stop();
  director.dispose();
  caption.textContent = "";
  log("세션 종료 — 설문");
  const result = await showSurvey(stage, { seed, durationMin, mirrorNotes: [...mirrorNotes] });
  const where = await saveSurvey(result);
  log(`설문 저장 — ${where}`);
  const bye = document.createElement("div");
  Object.assign(bye.style, {
    position: "absolute", inset: "0", zIndex: "30", background: "#12100e",
    display: "flex", alignItems: "center", justifyContent: "center", color: "#8c8072",
  });
  bye.textContent = "잘 먹었다는 말은 못 하겠고. 잘 봤어.";
  stage.appendChild(bye);
}

/* ── 시작 ── */
begin.onclick = async () => {
  begin.disabled = true;
  document.documentElement.requestFullscreen?.().catch(() => {}); // 키오스크
  try {
    capture = await startCapture();
  } catch (e) {
    // 캡처가 죽어도 세션은 계속된다 — 거울 채널 없이, 대화 채널만으로
    capture = null;
    log(`캡처 불가 — 거울 채널 없이 진행 (${errMsg(e)})`);
  }
  stt = startSTT((text) => void onUtterance(text), log);
  privacy.style.display = "none";
  startTimer();
  log(`세션 시작 — ${durationMin}분, seed ${seed}, 몸: ${streamUrl ? "픽셀 스트림" : "클립뱅크"}`);
};

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e instanceof Event) return e.type;
  return String(e);
}

log("대기 중 — [앉기] 를 누르면 웹캠 권한을 요청합니다. [t] 이음새 조정.");
