/**
 * Voice — 세컨의 목소리. 브라우저 내장 TTS(speechSynthesis, ko-KR)로 시작한다.
 * 전시 본선은 UE 쪽 TTS/오디오(unreal/SYNC.md: 립싱크는 오디오 커브로) — 이건 웹 몸의 목소리.
 *
 * 낮고 건조하게: rate 0.9, pitch 0.85. 시스템에 한국어 보이스가 없으면 조용히 포기한다.
 * 말하는 동안 자기 목소리를 STT 가 듣는 에코 루프 방지는 앱 셸이 (말할 땐 귀를 닫는다).
 */

let koVoice: SpeechSynthesisVoice | null = null;
let loaded = false;

function pickVoice() {
  if (loaded) return;
  const vs = speechSynthesis.getVoices();
  if (!vs.length) return; // 아직 로드 전 — 다음 기회에
  koVoice = vs.find((v) => v.lang.startsWith("ko") && /female|여성|Yuna|Sora|Heami/i.test(v.name))
    ?? vs.find((v) => v.lang.startsWith("ko"))
    ?? null;
  loaded = true;
}

export function voiceAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * 한 문장을 소리로. 시작/종료 콜백으로 앱 셸이 STT 를 닫았다 다시 연다.
 * onBoundary(charIndex)는 립싱크 트랙을 실제 발화 위치에 재동기화하는 데 쓴다.
 * 소리를 못 내면 false — 호출자는 자막만으로 계속한다.
 */
export function speak(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onBoundary?: (charIndex: number) => void,
): boolean {
  if (!voiceAvailable()) return false;
  pickVoice();
  try {
    speechSynthesis.cancel(); // 겹치면 이전 발화를 끊는다 — 세컨은 말을 포개지 않는다
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 0.9;
    u.pitch = 0.85;
    if (koVoice) u.voice = koVoice;
    let ended = false;
    const end = () => { if (!ended) { ended = true; onEnd?.(); } };
    u.onstart = () => onStart?.();
    u.onboundary = (e) => onBoundary?.(e.charIndex ?? 0);
    u.onend = end;
    u.onerror = end;
    // 일부 브라우저에서 onend 유실 대비 — 길이 기반 안전망
    setTimeout(end, Math.max(2000, text.length * 220));
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function shutUp() {
  if (voiceAvailable()) speechSynthesis.cancel();
}
