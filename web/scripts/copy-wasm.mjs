/**
 * @mediapipe/tasks-vision 의 wasm 런타임을 public/vendor/ 로 복사한다 (postinstall).
 * 전시장은 인터넷을 신뢰할 수 없다 — CDN 은 폴백일 뿐, 기본은 로컬 서빙이다.
 */
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../node_modules/@mediapipe/tasks-vision/wasm", import.meta.url));
const dst = fileURLToPath(new URL("../public/vendor/mediapipe-wasm", import.meta.url));

await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log("mediapipe wasm → public/vendor/mediapipe-wasm");
