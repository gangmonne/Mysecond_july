/**
 * STT — 브라우저 Web Speech API (ko-KR) 로 시작한다.
 * 전시 셋업에서는 로컬 Whisper(서버 경유)로 교체 — startSTT 시그니처만 유지하면 된다.
 * 오디오도 프레임과 같다: 저장하지 않는다. 텍스트만 남긴다.
 */

export interface STTHandle {
  stop(): void;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

export function startSTT(
  onFinal: (text: string) => void,
  onStatus?: (line: string) => void,
  lang = "ko-KR",
): STTHandle | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) {
    onStatus?.("stt — 이 브라우저는 Web Speech API 미지원 (Chrome 권장)");
    return null;
  }

  let stopped = false;
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) onFinal(text);
      }
    }
  };
  // 마이크 없음/권한 거부는 재시도 무의미 — 조용히 물러난다 (대화는 못 듣지만 세션은 계속)
  const FATAL = new Set(["audio-capture", "not-allowed", "service-not-allowed"]);
  rec.onerror = (e) => {
    if (FATAL.has(e.error)) {
      stopped = true;
      onStatus?.(`stt 중단 — ${e.error} (마이크 없음 또는 권한 거부)`);
    } else if (e.error !== "no-speech") {
      onStatus?.(`stt 오류 — ${e.error}`);
    }
  };
  rec.onend = () => {
    // 브라우저가 임의로 끊어도 세션 동안 계속 듣는다 — 단, 숨 고르고
    if (!stopped) setTimeout(() => { try { rec.start(); } catch { /* 이미 시작됨 */ } }, 800);
  };
  rec.start();
  onStatus?.("stt 시작 — 듣고 있다 (ko-KR)");

  return {
    stop() {
      stopped = true;
      rec.stop();
    },
  };
}
