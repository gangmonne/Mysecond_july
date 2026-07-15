import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// contract/ 는 web/ 밖(레포 루트)에 있다 — 단일 진실원을 web 과 server 가 공유한다.
const contractDir = fileURLToPath(new URL("../contract", import.meta.url));

export default defineConfig({
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
  },
});
