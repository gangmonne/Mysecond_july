import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// contract/ 는 web/ 밖(레포 루트)에 있다 — 단일 진실원을 web 과 server 가 공유한다.
const contractDir = fileURLToPath(new URL("../contract", import.meta.url));

export default defineConfig({
  // GitHub Pages 는 /<repo>/ 하위에 서빙된다 — CI 가 BASE_PATH 를 넘긴다. 로컬은 '/'.
  // Vite 는 앞뒤 슬래시를 요구하므로 정규화한다.
  base: (() => {
    let b = process.env.BASE_PATH || "/";
    if (!b.startsWith("/")) b = "/" + b;
    if (!b.endsWith("/")) b += "/";
    return b;
  })(),
  // 최상위 await(매니페스트 로드) 를 위해 모던 타깃. 전시 브라우저는 최신 Chromium 이다.
  build: { target: "esnext" },
  esbuild: { target: "esnext" },
  resolve: {
    alias: {
      "@contract": contractDir,
    },
  },
  server: {
    fs: {
      // web/ 루트 밖의 contract/ 를 dev 서버가 읽을 수 있게 허용
      allow: [fileURLToPath(new URL("..", import.meta.url))],
    },
    proxy: {
      // server/bridge.ts (포트 8787) — 브리지가 없어도 페이지는 동작한다
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
