/**
 * 앱 셸 — 전체 배선.
 *   자율신경 채널: 웹캠 → capture(P1) → director(P2) → renderer(P3) / bridge(P5)
 *   대화 채널:    STT → persona(P4, Claude) → renderer + 자막 / bridge(P5)
 *   세션 모드(P6): 키오스크 풀스크린, 타이머(기본 13분), 종료 설문 → 로컬 JSON.
 *   시네마틱:     레터박스·그레인·비네트·그레이드·자막 (ui/cinematic.ts)
 *   운영자 모니터: [m] — 세션 진행 상황을 실시간으로 (ui/monitor.ts). 오디언스엔 안 보인다.
 *
 * 콘솔 로그 대신 화면 내 '행동 봉투' 패널에 기록한다 (규약). 이 패널도 [m] 로만 열린다.
 * 웹캠 프레임·음성은 저장/전송하지 않는다 — 신호와 텍스트만 남긴다.
 *
 * URL 파라미터: ?seed=  난수 시드 / ?min=  세션 길이(분) /
 *               ?stream=ws://host:8888  UE Pixel Streaming 시그널링 (없으면 클립뱅크)
 */
import type { SignalEvent, Signal } from "@contract/contract";
import { SignalCapture, type FaceFrame } from "./capture/signals";
import { MirrorDirector } from "./director/mirror";
import { mulberry32 } from "./director/rng";
import { ClipBankRenderer, type Renderer, type ClipManifest } from "./renderer/clipbank";
import { PixelStreamRenderer } from "./renderer/pixelstream";
import { SpatialRenderer, webglAvailable } from "./renderer/spatial";
import { respond, SECOND_PROFILE } from "./brain/persona";
import { startSTT, type STTHandle } from "./brain/stt";
import { BridgeClient } from "./net/bridge";
import { SignalOverlay } from "./ui/overlay";
import { TuningPanel } from "./ui/tuning";
import { Cinematic } from "./ui/cinematic";
import { SessionMonitor } from "./ui/monitor";
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

/** 행동 봉투 패널에 한 줄 기록 (패널은 [m] 로만 열리지만 기록은 항상 남는다) */
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

/* ── 클립 매니페스트 (포스터/클립 URL, 선택) — 없으면 자리표시로 굴린다 ── */
const clipManifest: ClipManifest = await loadManifest();
async function loadManifest(): Promise<ClipManifest> {
  try {
    const r = await fetch("/clips/manifest.json", { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as ClipManifest) : {};
  } catch {
    return {};
  }
}

/* ── 시네마틱 레이어 ── */
const cinematic = new Cinematic(stage, caption);

/* ── 발화/무드 상태 (여러 곳에서 참조) ── */
let speakingNow = false;
let currentSay = "";
function onSpeaking(s: boolean) {
  speakingNow = s;
  director.setSpeaking(s);
  cinematic.setMood(s ? "talk" : "idle");
  monitor.setSpeaking(s, currentSay);
}

/* ── 몸 선택 ──
   ?stream= → 픽셀 스트림(전시 본선, 끊기면 폴백)
   그 외    → ?body= 또는 manifest.body: "spatial"(3D 형상) | "clip"(FMV, 기본) */
let renderer: Renderer = streamUrl
  ? new PixelStreamRenderer(
      bodyEl, streamUrl,
      () => {
        monitor.setStream("down");
        log("픽셀 스트림 끊김 — 폴백 (세컨은 죽지 않는다)");
        bodyEl.replaceChildren();
        renderer = makeBody();
      },
      () => monitor.setStream("up"),
    )
  : makeBody();
if (streamUrl) renderer.setSpeakingListener(onSpeaking);

/** ?body= / manifest.body 에 따라 형상(3D) 또는 클립뱅크(FMV) 몸을 만든다 */
function makeBody(): Renderer {
  const want = params.get("body") ?? clipManifest.body ?? "clip";
  if (want === "spatial" && webglAvailable()) {
    try {
      const r = new SpatialRenderer(bodyEl, clipManifest.mesh);
      r.setSpeakingListener(onSpeaking);
      log(`몸: 형상(3D)${clipManifest.mesh ? " — 스캔 메시" : " — 점군 폴백"}`);
      return r;
    } catch (e) {
      log(`형상 렌더 실패 — 클립뱅크로 (${errMsg(e)})`);
    }
  }
  return makeClipBank();
}

function makeClipBank(): Renderer {
  const r = new ClipBankRenderer(bodyEl, mulberry32(seed ^ 0x9e3779b9), clipManifest);
  r.setSpeakingListener(onSpeaking);
  log(clipManifest.poster ? "몸: 클립뱅크 (포스터 얼굴)" : "몸: 클립뱅크 (자리표시)");
  return r;
}

/* ── 브리지(P5): Envelope 를 허브로 publish — 없어도 세션은 계속된다 ── */
const bridge = new BridgeClient(undefined, log, (up) => monitor.setBridge(up));
bridge.connect();

/* ── 디렉터(P2): 무시·지연·열화 게이팅 ── */
const mirrorNotes: string[] = []; // 최근 거울 이력 — 뇌 프롬프트에 주입
const director = new MirrorDirector({}, seed, {
  onMirror: (m) => {
    renderer.mirror(m);
    // 그 몸짓을 하던 순간의 표정을 — 이제서야, fidelity 만큼만 — 재생한다
    const snip = gestureSnips.get(m.gesture);
    if (snip) spatialBody()?.replayExpression(snip, m.fidelity);
    bridge.publish(m);
    cinematic.setMood("gesture");
    setTimeout(() => cinematic.setMood(speakingNow ? "talk" : "idle"), 2200);
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

/* ── 운영자 모니터([m]) + 이음새 조정([t]) ── */
const monitor = new SessionMonitor(stage, () => director.snapshot());
const tuning = new TuningPanel(stage, (cfg) => {
  director.setConfig(cfg);
  log(`이음새 조정 — 상한 ${cfg.sessionCap}회, 전역 쿨다운 ${cfg.globalCooldownMs / 1000}s`);
});
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "t") tuning.toggle();
  if (e.key === "m") monitor.toggle();
});

// 모니터를 여는 방법 3가지 — 키보드가 없어도, 단축키를 몰라도 열 수 있게:
//  1) [m] 키   2) URL 에 ?monitor=1   3) 좌상단 구석을 클릭 (관객은 눈치채지 못한다)
if (params.get("monitor") === "1") monitor.toggle();
const hotCorner = document.createElement("div");
Object.assign(hotCorner.style, {
  position: "absolute", left: "0", top: "0", width: "28px", height: "28px",
  zIndex: "40", cursor: "default",
});
hotCorner.title = "감독 모니터 (m)";
hotCorner.onclick = () => monitor.toggle();
stage.appendChild(hotCorner);

/* ── 대화 채널(P4): STT → persona → 자막 + 몸 ── */
let thinking = false;
async function onUtterance(text: string) {
  if (thinking) return; // 생각 중엔 다음 발화를 받지 않는다 — 세컨은 서두르지 않는다
  thinking = true;
  log(`관객: "${text}"`);
  try {
    const action = await respond(text, SECOND_PROFILE, [], [...mirrorNotes]);
    currentSay = action.say;
    // 자막은 흐릿하게 떠올랐다 늦게 사라진다 — 몸은 renderer 가 desync_ms 만큼 늦게 따라온다
    const holdMs = Math.max(1400, action.say.length * 145) + action.glitch.desync_ms + 1200;
    cinematic.say(action.say, holdMs);
    renderer.perform(action);
    bridge.publish(action);
    log(`세컨: "${action.say}" (${action.emotion}, 시선 ${action.gaze})`);
  } finally {
    thinking = false;
  }
}

/* ── 캡처(P1): 웹캠 → SignalEvent. 프레임은 감지 즉시 버려진다 ── */
const overlay = new SignalOverlay(stage);

/* ── 표정 채널 (P2.5): FaceFrame 링버퍼 + 몸짓 순간의 스니펫 보관 ──
   라이브 직결(?live=1)은 리허설 전용이다 — 본 세션의 표정은 거울 이벤트가
   발화할 때, 그 몸짓을 하던 순간의 스니펫을 뒤늦게 열화시켜 재생한다. */
const liveMode = params.get("live") === "1";
const faceRing: FaceFrame[] = [];
const gestureSnips = new Map<string, FaceFrame[]>();

function onFaceFrame(f: FaceFrame) {
  faceRing.push(f);
  while (faceRing.length && f.t - faceRing[0].t > 4000) faceRing.shift();
  if (liveMode) spatialBody()?.expression(f, 1);
}

/** 지금 몸이 형상(3D)이면 그 표정 API 를 돌려준다 */
function spatialBody(): SpatialRenderer | null {
  return renderer instanceof SpatialRenderer ? renderer : null;
}

/** capture 와 리허설 훅이 공유하는 신호 입구 */
function emitSignal(s: SignalEvent) {
  overlay.note(s);
  monitor.signal(s);
  // 몸짓이 감지된 그 순간의 표정 1.6초를 보관 — 나중에 거울이 이걸 재생한다
  const snip = faceRing.filter((f) => f.t > s.t - 1600);
  if (snip.length) gestureSnips.set(s.signal, snip);
  director.ingest(s);
}

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
  const capture = new SignalCapture(camVideo, emitSignal, onFaceFrame);
  log("감지 모델 로딩 중…");
  await capture.init();
  capture.start();
  log("캡처 시작 — ~15fps, 신호만 남는다");
  return capture;
}

/* ── 세션 모드(P6): 타이머 → 종료 → 설문 → 로컬 저장 ── */
let capture: SignalCapture | null = null;
let stt: STTHandle | null = null;

function startTimer(endAt: number) {
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
  monitor.setCamera(false);
  director.dispose();
  cinematic.clear();
  cinematic.setMood("idle");
  log("세션 종료 — 설문");
  const result = await showSurvey(stage, { seed, durationMin, mirrorNotes: [...mirrorNotes] });
  const where = await saveSurvey(result);
  log(`설문 저장 — ${where}`);
  const bye = document.createElement("div");
  Object.assign(bye.style, {
    position: "absolute", inset: "0", zIndex: "30", background: "#000",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#8c8072", fontWeight: "300", letterSpacing: "0.14em", fontSize: "16px",
  });
  bye.textContent = "잘 먹었다는 말은 못 하겠고. 잘 봤어.";
  stage.appendChild(bye);
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e instanceof Event) return e.type;
  return String(e);
}

/* ── 시작 (콜드 오픈 → 세션) ── */
begin.onclick = async () => {
  begin.disabled = true;
  document.documentElement.requestFullscreen?.().catch(() => {}); // 키오스크

  const startedAt = Date.now();
  const endAt = startedAt + durationMin * 60_000;
  monitor.startSession(seed, startedAt, endAt);

  // 콜드 오픈은 즉시 열린다 — 몸(거울 채널) 로딩을 기다리지 않는다
  privacy.classList.add("fade");
  setTimeout(() => { privacy.style.display = "none"; }, 1400);
  cinematic.enter();
  startTimer(endAt);
  log(`세션 시작 — ${durationMin}분, seed ${seed}`);

  // 대화 채널
  stt = startSTT(
    (text) => void onUtterance(text),
    (line) => { log(line); monitor.setStt(line.replace(/^stt\s*/, "").slice(0, 22)); },
  );

  // 자율신경 채널 — 뒷단에서 붙는다. 실패해도 세션은 대화만으로 계속된다
  void startCapture()
    .then((c) => { capture = c; monitor.setCamera(true); })
    .catch((e) => {
      capture = null;
      monitor.setCamera(false);
      log(`캡처 불가 — 거울 채널 없이 진행 (${errMsg(e)})`);
    });
};

log("대기 중 — [앉기] 를 누르면 웹캠 권한을 요청합니다. [t] 이음새 조정 · [m] 감독 모니터.");

/* 리허설 훅 (dev 빌드에만 존재) — 마이크/웹캠 없이 대사·신호를 흘려 넣어본다.
   콘솔에서: __second.say("맛있어?") / __second.signal("reach_hand") / __second.monitor() */
if (import.meta.env.DEV) {
  (window as unknown as { __second: unknown }).__second = {
    say: (t: string) => onUtterance(t),
    signal: (g: Signal) => emitSignal({ signal: g, t: Date.now(), strength: 0.85 }),
    monitor: () => monitor.toggle(),
    tuning: () => tuning.toggle(),
    /** 가짜 표정 프레임 주입 — 마이크·웹캠 없이 표정 채널을 시험한다 */
    face: (jaw = 0.6, smile = 0, brow = 0) =>
      onFaceFrame({ t: Date.now(), jaw, smile, brow, browUp: 0, blink: 0, yaw: 0, pitch: 0, roll: 0 }),
    /** 스니펫 없이도 재생을 시험한다: 합성 찡그림 1.2초를 fidelity 로 재생 */
    replay: (fidelity = 0.5) => {
      const t0 = Date.now();
      const frames: FaceFrame[] = Array.from({ length: 18 }, (_, i) => ({
        t: t0 + i * 66, jaw: 0, smile: 0, browUp: 0, blink: 0,
        brow: Math.sin((i / 17) * Math.PI) * 0.9,
        yaw: 0, pitch: Math.sin((i / 17) * Math.PI) * 0.12, roll: 0,
      }));
      spatialBody()?.replayExpression(frames, fidelity);
    },
  };
}
