/**
 * Lipsync — 한글 텍스트를 입모양(viseme) 타임라인으로 근사한다.
 * TTS 오디오 분석 없이 음절 단위로: 모음의 개구도 → jaw, ㅣ/ㅡ 계열 → smile(입 벌림 가로),
 * ㅁ/ㅂ/ㅍ 계열 → 입 다묾. 메타휴먼처럼 정확하진 않지만 말하는 만큼 입이 움직인다.
 * (전시 본선 립싱크는 UE 쪽 오디오 커브 — unreal/SYNC.md. 이건 웹 몸과 UE 피드용 근사.)
 */

export interface Viseme {
  t: number;     // 트랙 시작 기준 ms
  jaw: number;   // 0..1
  smile: number; // 0..1 (입이 가로로 벌어지는 성분)
}

/* 중성(모음) 21개의 개구도 — ㅏ 가 가장 크게, ㅡ/ㅣ 가 가장 작게 */
const VOWEL_JAW = [
  0.75, 0.58, 0.72, 0.56, // ㅏ ㅐ ㅑ ㅒ
  0.6, 0.5, 0.58, 0.48,   // ㅓ ㅔ ㅕ ㅖ
  0.4, 0.65, 0.58, 0.45,  // ㅗ ㅘ ㅙ ㅚ
  0.38, 0.35, 0.55, 0.5,  // ㅛ ㅜ ㅝ ㅞ
  0.35, 0.33, 0.2, 0.3,   // ㅟ ㅠ ㅡ ㅢ
  0.22,                   // ㅣ
];
const VOWEL_SMILE = [
  0, 0.2, 0, 0.2, 0, 0.25, 0, 0.25,
  0, 0, 0.15, 0.2, 0, 0, 0, 0.15,
  0.2, 0, 0.25, 0.2, 0.35,
];
/* 초성에서 입을 다물고 시작하는 소리: ㅁ(6) ㅂ(7) ㅃ(8) ㅍ(17) */
const CLOSED_CHO = new Set([6, 7, 8, 17]);
/* 종성에서 입을 다물며 끝나는 받침: ㅁ(16) ㅂ(17) */
const CLOSED_JONG = new Set([16, 17]);

/** 텍스트 전체를 durMs 에 맞춰 viseme 트랙으로 */
export function koreanVisemes(text: string, durMs: number): Viseme[] {
  const chars = [...text.replace(/\s+/g, " ")];
  if (!chars.length) return [{ t: 0, jaw: 0, smile: 0 }];
  const step = durMs / chars.length;
  const out: Viseme[] = [{ t: 0, jaw: 0, smile: 0 }];

  chars.forEach((ch, i) => {
    const t0 = i * step;
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code >= 11172) {
      // 비한글: 공백/문장부호는 다묾, 그 외(숫자·라틴)는 작은 벌림
      out.push({ t: t0 + step * 0.3, jaw: /[\s.,!?…]/.test(ch) ? 0.02 : 0.25, smile: 0 });
      return;
    }
    const cho = Math.floor(code / 588);
    const jung = Math.floor((code % 588) / 28);
    const jong = code % 28;
    const jaw = VOWEL_JAW[jung] ?? 0.4;
    const smile = VOWEL_SMILE[jung] ?? 0;

    if (CLOSED_CHO.has(cho)) out.push({ t: t0 + step * 0.08, jaw: 0.02, smile: 0 }); // 입술 닫힘
    out.push({ t: t0 + step * 0.35, jaw, smile });                                    // 모음 개방
    if (jong && CLOSED_JONG.has(jong)) out.push({ t: t0 + step * 0.85, jaw: 0.04, smile: 0 });
    else out.push({ t: t0 + step * 0.9, jaw: jaw * 0.35, smile: smile * 0.5 });        // 감쇠
  });

  out.push({ t: durMs, jaw: 0, smile: 0 });
  return out;
}

/** 트랙에서 경과시간 elapsedMs 의 입모양을 선형 보간 */
export function sampleVisemes(track: Viseme[], elapsedMs: number): { jaw: number; smile: number } {
  if (elapsedMs <= track[0].t) return { jaw: track[0].jaw, smile: track[0].smile };
  for (let i = 1; i < track.length; i++) {
    if (elapsedMs < track[i].t) {
      const a = track[i - 1], b = track[i];
      const k = (elapsedMs - a.t) / Math.max(1, b.t - a.t);
      return { jaw: a.jaw + (b.jaw - a.jaw) * k, smile: a.smile + (b.smile - a.smile) * k };
    }
  }
  const last = track[track.length - 1];
  return { jaw: last.jaw, smile: last.smile };
}
