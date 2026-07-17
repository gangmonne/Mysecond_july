/**
 * mock_unreal — 가짜 언리얼. 브리지(/ws)를 구독해 UE(BP_SecondDirector)가 받게 될
 * 것을 그대로 받아 찍는다. 언리얼 없이 동기화 파이프라인을 검증하는 용도.
 *
 *   node mock_unreal.ts [ws://localhost:8787/ws]
 *
 * 받는 것 (contract.ts 어휘):
 *   action — 대사/감정/시선/글리치  → 립싱크·몽타주 트리거에 해당
 *   mirror — 늦은 몸짓 (gesture/delay_ms/fidelity)
 *   gaze   — 시선 힌트
 *   face   — 연속 표정 프레임 (≤10fps) → 메타휴먼 ARKit 블렌드셰이프 구동에 해당
 */
import WebSocket from "ws";

const url = process.argv[2] ?? "ws://localhost:8787/ws";
const counts: Record<string, number> = {};
let faceLast: Record<string, number> | null = null;

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

const ws = new WebSocket(url);
ws.on("open", () => console.log(`[mock_unreal ${stamp()}] 접속 — ${url} (BP_SecondDirector 대역)`));
ws.on("close", () => { console.log(`[mock_unreal ${stamp()}] 연결 종료`); process.exit(0); });
ws.on("error", (e) => { console.error(`[mock_unreal] ${e.message} — 브리지가 켜져 있나?`); process.exit(1); });

ws.on("message", (data) => {
  let m: Record<string, unknown>;
  try { m = JSON.parse(data.toString()); } catch { return; }
  const kind = String(m.kind ?? m.signal ?? "?");
  counts[kind] = (counts[kind] ?? 0) + 1;

  if (kind === "action") {
    console.log(`[${stamp()}] ACTION  say="${m.say}" emotion=${m.emotion} gaze=${m.gaze} desync=${(m as { glitch?: { desync_ms?: number } }).glitch?.desync_ms}ms`);
  } else if (kind === "mirror") {
    console.log(`[${stamp()}] MIRROR  ${m.gesture}  +${m.delay_ms}ms  fidelity=${m.fidelity}`);
  } else if (kind === "gaze") {
    console.log(`[${stamp()}] GAZE    → ${m.target}`);
  } else if (kind === "face") {
    faceLast = m as Record<string, number>; // 고빈도라 개별 출력 대신 1초 요약
  } else if (kind === "monitor") {
    // 감독 모니터 상태 — UE 는 무시
  } else {
    console.log(`[${stamp()}] ?       ${data.toString().slice(0, 100)}`);
  }
});

// 표정 피드는 1초마다 요약 (수신율 + 마지막 값)
setInterval(() => {
  const n = counts.face ?? 0;
  if (!n || !faceLast) return;
  console.log(
    `[${stamp()}] FACE    ${n}fr 누적 | jaw=${fix(faceLast.jaw)} smile=${fix(faceLast.smile)} brow=${fix(faceLast.brow)} yaw=${fix(faceLast.yaw)} pitch=${fix(faceLast.pitch)}`,
  );
}, 1000);

function fix(v: unknown) { return typeof v === "number" ? v.toFixed(2) : "?"; }
