/**
 * 앱 셸 — P0: 계약(contract)이 web 에서 살아있는지 확인하는 최소 진입점.
 * 콘솔 로그 대신 화면 내 '행동 봉투' 패널에 기록한다 (규약).
 * P1~P3 에서 capture / director / renderer 가 여기에 배선된다.
 */
import { SIGNALS, GESTURES, validateAction } from "@contract/contract";

const envelope = document.getElementById("envelope")!;

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

log(`계약 로드 — 신호 ${SIGNALS.length}종: ${SIGNALS.join(", ")}`);
log(`계약 로드 — 몸짓 ${GESTURES.length}종: ${GESTURES.join(", ")}`);

const probe = validateAction({ say: "…와 있어.", emotion: "neutral", gaze: "away" });
log(`계약 검증 — validateAction ok (gaze=${probe.gaze}, emotion=${probe.emotion})`);
