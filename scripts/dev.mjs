/**
 * 원클릭 런처 — 세컨과의 식사 LIVE.
 *
 *   npm start        (레포 루트에서)
 *
 * 이거 하나가:
 *   1) web / server 의존성을 (없으면) 설치하고
 *   2) 브리지 서버(:8787)와 페이지(:5173)를 함께 띄우고
 *   3) 브라우저로 열 주소를 정확히 찍어준다 (이 PC + 같은 와이파이의 다른 기기용).
 *
 * "localhost 연결 거부(ERR_CONNECTION_REFUSED)" 는 서버가 안 켜졌다는 뜻이다.
 * 이 창(터미널)을 열어둔 채로 아래 주소를 열면 된다. 창을 닫으면 서버도 꺼진다.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";

const root = fileURLToPath(new URL("..", import.meta.url));
const webDir = fileURLToPath(new URL("../web", import.meta.url));
const serverDir = fileURLToPath(new URL("../server", import.meta.url));
const WEB_PORT = 5173;
const BRIDGE_PORT = 8787;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  warm: (s) => `\x1b[38;5;179m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

// SECOND_DRY=1 이면 실제 실행 없이 무엇을 띄울지만 출력한다 (검증용)
const DRY = process.env.SECOND_DRY === "1";

function run(cmd, args, cwd, opts = {}) {
  if (DRY) {
    console.log(c.dim(`[dry] ${cmd} ${args.join(" ")}  (cwd: ${cwd.replace(root, ".")}` +
      (opts.env?.PORT ? `, PORT=${opts.env.PORT}` : "") + ")"));
    const noop = { on: () => {}, kill: () => {} };
    return noop;
  }
  return spawn(cmd, args, { cwd, stdio: "inherit", shell: true, ...opts });
}

/** 동기 설치 (없을 때만) */
function install(dir, label) {
  if (existsSync(`${dir}/node_modules`)) return Promise.resolve();
  console.log(c.dim(`· ${label} 의존성 설치 중… (처음 한 번, 몇 분 걸릴 수 있어요)`));
  return new Promise((resolve, reject) => {
    const p = run("npm", ["install"], dir);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} npm install 실패 (code ${code})`))));
  });
}

function lanIP() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return null;
}

function banner() {
  const ip = lanIP();
  const line = "─".repeat(58);
  console.log("\n" + c.warm(line));
  console.log(c.bold("  세컨과의 식사 — LIVE 가 켜졌습니다."));
  console.log(c.warm(line));
  console.log("  " + c.bold("전시/리허설 화면") + c.dim("  (브라우저로 이 주소를 여세요)"));
  console.log("     " + c.green(`http://localhost:${WEB_PORT}`));
  console.log("  " + c.bold("감독 모니터") + c.dim("  (다른 노트북·폰에서 세션을 지켜볼 때)"));
  console.log("     " + c.green(`http://localhost:${BRIDGE_PORT}/monitor`));
  if (ip) {
    console.log(c.dim("\n  같은 와이파이의 다른 기기에서는 localhost 대신 이 PC 주소로:"));
    console.log("     화면    " + c.green(`http://${ip}:${WEB_PORT}`));
    console.log("     모니터  " + c.green(`http://${ip}:${BRIDGE_PORT}/monitor`));
  }
  console.log(c.dim(`\n  이 터미널 창을 닫으면 꺼집니다. 멈추려면 Ctrl+C.`));
  console.log(c.warm(line) + "\n");
}

async function main() {
  console.log(c.bold("\n세컨과의 식사 — LIVE 시작 준비…\n"));
  try {
    await install(serverDir, "server");
    await install(webDir, "web");
  } catch (e) {
    console.error(c.red(`\n설치 실패 — ${e.message}`));
    console.error(c.dim("Node.js 가 설치돼 있는지 확인하세요 (https://nodejs.org, LTS)."));
    process.exit(1);
  }

  const children = [];
  // 브리지 (:8787) — Claude 프록시 + 원격 모니터 + 설문 저장. 키는 있으면 넘긴다.
  children.push(run("node", ["bridge.ts"], serverDir, {
    env: { ...process.env, PORT: String(BRIDGE_PORT) },
  }));
  // 페이지 (:5173) — --host 로 같은 와이파이의 다른 기기도 접속 가능
  children.push(run("npm", ["run", "dev", "--", "--host", "--port", String(WEB_PORT), "--strictPort"], webDir));

  setTimeout(banner, 2500);

  const bye = () => { for (const ch of children) ch.kill("SIGINT"); process.exit(0); };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
  for (const ch of children) {
    ch.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(c.red(`\n프로세스가 종료됐습니다 (code ${code}). 포트 ${WEB_PORT}/${BRIDGE_PORT} 가 이미 쓰이고 있지는 않은지 확인하세요.`));
      }
    });
  }
}

main();
