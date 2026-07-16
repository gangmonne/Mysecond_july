/**
 * 배포 베이스 경로 처리 — GitHub Pages 는 /<repo>/ 하위에 서빙되므로
 * 런타임 fetch('/clips/…') 같은 절대경로가 깨진다. Vite 의 BASE_URL 로 접두한다.
 * (로컬 dev 는 BASE_URL='/' 라 그대로 동작.)
 */
export const BASE = import.meta.env.BASE_URL; // 항상 "/" 로 끝난다

/** '/clips/x' → '/<base>/clips/x'. 절대 URL(http…)과 상대경로는 건드리지 않는다 */
export function withBase(p: string): string {
  if (!p || /^([a-z]+:)?\/\//i.test(p)) return p;
  return p.startsWith("/") ? BASE.replace(/\/$/, "") + p : p;
}
