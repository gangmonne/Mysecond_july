/**
 * 앱 셸 — 캡처(P1) → 디렉터(P2) → 클립뱅크 렌더러(P3) 배선.
 * 콘솔 로그 대신 화면 내 '행동 봉투' 패널에 기록한다 (규약).
 * 웹캠 프레임은 저장/전송하지 않는다 — 신호(SignalEvent)만 남긴다.
 */
import { SignalCapture } from "./capture/signals";
import { MirrorDirector } from "./director/mirror";
import { mulberry32 } from "./director/rng";
import { ClipBankRenderer, type Renderer } from "./renderer/clipbank";
import { SignalOverlay } from "./ui/overlay";
import { TuningPanel } from "./ui/tuning";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 20260703);

const stage = document.getElementById("stage")!;
const bodyEl = document.getElementById("body")!;
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
  envelope.scrollTop = envelope.scrollHeight;
}

/* ── 몸: 클립 뱅크 (전시 본선에서는 PixelStream 으로 교체) ── */
const renderer: Renderer = new ClipBankRenderer(bodyEl, mulberry32(seed ^ 0x9e3779b9));

/* ── 디렉터: 무시·지연·열화 게이팅 ── */
const mirrorNotes: string[] = []; // 최근 거울 이력 — P4 에서 뇌 프롬프트에 주입
const director = new MirrorDirector({}, seed, {
  onMirror: (m) => renderer.mirror(m),
  onDecision: (line) => log(line),
  onGazeHint: (g, reason) => {
    renderer.gaze(g);
    log(`시선 → ${g} (${reason})`);
  },
  onMemoryNote: (note) => {
    mirrorNotes.push(note);
    if (mirrorNotes.length > 3) mirrorNotes.shift();
  },
});
renderer.setSpeakingListener((s) => director.setSpeaking(s));

/* ── 이음새 조정 (P2): 키 [t] ── */
const tuning = new TuningPanel(stage, (cfg) => {
  director.setConfig(cfg);
  log(`이음새 조정 — 상한 ${cfg.sessionCap}회, 전역 쿨다운 ${cfg.globalCooldownMs / 1000}s`);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "t" && !(e.target instanceof HTMLInputElement)) tuning.toggle();
});

/* ── 캡처 (P1): 웹캠 → SignalEvent. 프레임은 감지 즉시 버려진다 ── */
const overlay = new SignalOverlay(stage);
const camVideo = document.createElement("video");
Object.assign(camVideo, { muted: true, playsInline: true });
Object.assign(camVideo.style, {
  position: "absolute", width: "1px", height: "1px", opacity: "0", pointerEvents: "none",
});
stage.appendChild(camVideo);

async function startCapture() {
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

/* ── 시작 ── */
begin.onclick = async () => {
  begin.disabled = true;
  document.documentElement.requestFullscreen?.().catch(() => {});
  try {
    await startCapture();
    privacy.style.display = "none";
    log(`세션 시작 (seed ${seed})`);
  } catch (e) {
    begin.disabled = false;
    log(`시작 실패 — ${e instanceof Error ? e.message : e}`);
  }
};

log("대기 중 — [앉기] 를 누르면 웹캠 권한을 요청합니다. [t] 이음새 조정.");
