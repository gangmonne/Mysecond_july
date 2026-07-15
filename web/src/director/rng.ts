/**
 * 시드 가능한 RNG (mulberry32) — 모든 무작위성은 여기서 나온다 (리허설 재현 규약).
 * URL ?seed= 로 세션 전체를 재현할 수 있다.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
