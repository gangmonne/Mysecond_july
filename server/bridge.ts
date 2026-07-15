/**
 * Bridge — WebSocket 허브 + HTTP API. 포트 8787 (env PORT).
 *
 *   ws  /ws          페이지가 Envelope(Action|MirrorEvent|gaze)를 publish,
 *                    UE(또는 mock 수신기)가 subscribe. 받은 메시지를 나머지 전원에게 중계.
 *   POST /api/second { system, user } → Anthropic Messages API 프록시 (키는 서버 환경변수)
 *   POST /api/survey 세션 종료 설문을 sessions/*.json 으로 로컬 저장
 *   GET  /healthz
 *
 * 옵션 OSC 게이트웨이(ws→udp 7000, 기존 파이썬 mock_unreal 호환)는 OSC_UDP_PORT 설정 시 켜진다.
 * 실행: node bridge.ts  (Node 22.18+ 타입 스트리핑)
 */
import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { createSocket } from "node:dgram";
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.SECOND_MODEL ?? "claude-sonnet-5";
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const OSC_UDP_PORT = Number(process.env.OSC_UDP_PORT ?? 0);

function say(line: string) {
  process.stdout.write(`[bridge ${new Date().toISOString().slice(11, 19)}] ${line}\n`);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

/* ── HTTP ── */
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true });

    if (req.method === "POST" && req.url === "/api/second") {
      if (!API_KEY) return json(res, 503, { error: "no_api_key — ANTHROPIC_API_KEY 를 설정하세요" });
      const { system, user } = JSON.parse(await readBody(req)) as { system: string; user: string };
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!r.ok) return json(res, 502, { error: `anthropic ${r.status}: ${await r.text()}` });
      const data = (await r.json()) as { content: { type: string; text?: string }[] };
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      return json(res, 200, { text });
    }

    if (req.method === "POST" && req.url === "/api/survey") {
      const body = await readBody(req);
      JSON.parse(body); // 유효성만 확인
      await mkdir(new URL("./sessions/", import.meta.url), { recursive: true });
      const name = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      await writeFile(new URL(`./sessions/${name}`, import.meta.url), body, "utf8");
      say(`설문 저장 — sessions/${name}`);
      return json(res, 200, { saved: name });
    }

    json(res, 404, { error: "not_found" });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── WebSocket 허브 ── */
const wss = new WebSocketServer({ server, path: "/ws" });
const peers = new Set<WebSocket>();
wss.on("connection", (ws) => {
  peers.add(ws);
  say(`peer 접속 (${peers.size}명)`);
  ws.on("message", (data, isBinary) => {
    if (!isBinary && OSC_UDP_PORT) forwardOsc(data.toString());
    for (const p of peers) {
      if (p !== ws && p.readyState === p.OPEN) p.send(data, { binary: isBinary });
    }
  });
  ws.on("close", () => {
    peers.delete(ws);
    say(`peer 이탈 (${peers.size}명)`);
  });
});

/* ── 옵션: OSC 게이트웨이 (기존 파이썬 mock_unreal 호환, udp://127.0.0.1:OSC_UDP_PORT) ── */
const udp = OSC_UDP_PORT ? createSocket("udp4") : null;

function forwardOsc(raw: string) {
  try {
    const m = JSON.parse(raw) as { kind?: string };
    let addr: string | null = null;
    let args: (string | number)[] = [];
    if (m.kind === "action") {
      const a = m as unknown as {
        say: string; emotion: string; gaze: string; gaze_curve: string; eat_mimic: boolean;
        glitch: { expr_freeze: number; desync_ms: number; texture_break: number };
      };
      addr = "/second/action";
      args = [a.say, a.emotion, a.gaze, a.gaze_curve, a.eat_mimic ? 1 : 0,
        a.glitch.expr_freeze, a.glitch.desync_ms, a.glitch.texture_break];
    } else if (m.kind === "mirror") {
      const mm = m as unknown as { gesture: string; delay_ms: number; fidelity: number };
      addr = "/second/mirror";
      args = [mm.gesture, mm.delay_ms, mm.fidelity];
    }
    if (addr && udp) udp.send(encodeOsc(addr, args), OSC_UDP_PORT, "127.0.0.1");
  } catch { /* 계약 밖 메시지는 중계만 하고 OSC 로는 보내지 않는다 */ }
}

/** 최소 OSC 1.0 인코더 — string(s) / float(f) / int(i) 만 쓴다 */
function encodeOsc(addr: string, args: (string | number)[]): Buffer {
  const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const str = (s: string) => pad(Buffer.from(s + "\0", "utf8"));
  const tags = "," + args.map((a) => (typeof a === "string" ? "s" : Number.isInteger(a) ? "i" : "f")).join("");
  const parts = [str(addr), str(tags)];
  for (const a of args) {
    if (typeof a === "string") parts.push(str(a));
    else {
      const b = Buffer.alloc(4);
      if (Number.isInteger(a)) b.writeInt32BE(a);
      else b.writeFloatBE(a);
      parts.push(b);
    }
  }
  return Buffer.concat(parts);
}

server.listen(PORT, () => {
  say(`http/ws 허브 기동 — :${PORT} (모델 ${MODEL}${API_KEY ? "" : ", 키 없음 → /api/second 503"}${OSC_UDP_PORT ? `, osc→udp:${OSC_UDP_PORT}` : ""})`);
});
