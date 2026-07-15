import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// contract/ 는 web/ 밖(레포 루트)에 있다 — 단일 진실원을 web 과 server 가 공유한다.
const contractDir = fileURLToPath(new URL("../contract", import.meta.url));

export default defineConfig({
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
