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

    // 원격 감독 모니터 — 다른 기기(노트북/폰) 브라우저로 이 주소를 연다
    if (req.method === "GET" && (req.url === "/monitor" || req.url === "/")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(MONITOR_HTML);
    }

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
  say(`감독 모니터 — http://localhost:${PORT}/monitor (같은 와이파이의 다른 기기에선 http://<이 PC IP>:${PORT}/monitor)`);
});

/* ── 원격 감독 모니터 페이지 (self-contained) ──
   세션 페이지가 500ms 마다 {kind:'monitor', …} 을 publish → 허브가 이 페이지로 중계 → 렌더 */
const MONITOR_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>세컨 · 감독 모니터</title><style>
:root{color-scheme:dark}
*{margin:0;box-sizing:border-box}
body{background:#0a0807;color:#b7ad9d;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:14px;line-height:1.5;padding:18px;-webkit-font-smoothing:antialiased}
h1{font-size:12px;letter-spacing:.24em;color:#6d6355;font-weight:400;margin-bottom:14px;text-transform:uppercase}
.grid{display:grid;gap:14px;max-width:560px}
.card{border:1px solid #221e19;border-radius:8px;padding:12px 14px;background:rgba(255,255,255,.012)}
.k{color:#6d6355;font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}
.big{font-size:26px;color:#e4ddd0;letter-spacing:.04em}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.pips{font-size:18px;letter-spacing:.12em;color:#c9a06a}
.dim{color:#6d6355}
.bar{height:6px;background:#221e19;border-radius:3px;overflow:hidden;margin-top:6px}
.bar>i{display:block;height:100%;background:#c9a06a}
.say{color:#e4ddd0;font-style:italic}
.chip{display:inline-block;padding:1px 7px;border:1px solid #2a251f;border-radius:20px;margin-right:6px;font-size:12px}
.on{color:#8fbf8f;border-color:#31402f}.off{color:#6d6355}.down{color:#c98a6a;border-color:#40312f}
.sig{display:flex;justify-content:space-between;color:#8c8072;font-size:12px;padding:2px 0}
#stale{color:#c98a6a}
ul{list-style:none}
li{padding:2px 0}
</style></head><body>
<h1>세컨 · 감독 모니터 <span id="conn" class="dim">· 연결 중…</span></h1>
<div class="grid">
  <div class="card"><div class="k">세션</div>
    <div class="row"><div class="big" id="remain">–:––</div><div class="dim" id="elapsed"></div></div>
    <div class="dim" id="seed"></div></div>
  <div class="card"><div class="k">거울 (세션 상한 대비)</div>
    <div class="row"><div class="pips" id="pips">········</div><div id="fired" class="dim"></div></div>
    <div id="cool" class="dim" style="margin-top:6px"></div>
    <div class="bar"><i id="coolbar" style="width:0%"></i></div>
    <ul id="pending" style="margin-top:8px"></ul></div>
  <div class="card"><div class="k">발화 · 시선</div>
    <div class="row"><div id="speak">○ 침묵</div><div class="dim" id="gaze"></div></div>
    <div class="say" id="say" style="margin-top:6px"></div></div>
  <div class="card"><div class="k">채널</div><div id="chan"></div></div>
  <div class="card"><div class="k">최근 신호</div><div id="signals" class="dim">—</div></div>
</div>
<script>
const $=id=>document.getElementById(id);
const KO={frown:"찡그림",smile:"웃음",reach_hand:"손 뻗기",lean_in:"몸 기울이기",head_tilt:"고개 기울이기"};
let last=null, lastAt=0;
function mmss(ms){ms=Math.max(0,ms|0);const s=(ms/1000)|0;return (s/60|0)+":"+String(s%60).padStart(2,"0")}
function dot(on){return on?"●":"○"}
function connect(){
  const ws=new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host+"/ws");
  ws.onopen=()=>{$("conn").textContent="· 연결됨";$("conn").className=""};
  ws.onclose=()=>{$("conn").textContent="· 끊김 — 재연결";$("conn").className="down";setTimeout(connect,1500)};
  ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m&&m.kind==="monitor"){last=m;lastAt=Date.now()}}catch{}};
}
connect();
setInterval(()=>{
  if(!last){return}
  const m=last, now=Date.now();
  const sess=m.session||{}, d=m.director||{}, ch=m.channels||{};
  const remain = sess.endAt? sess.endAt-now : 0;
  const elapsed = sess.startedAt? now-sess.startedAt : 0;
  $("remain").textContent=mmss(remain);
  $("elapsed").textContent=mmss(elapsed)+" 경과";
  $("seed").textContent="seed "+(sess.seed??"–");
  const fired=d.fired||0, cap=d.cap||8;
  $("pips").textContent="●".repeat(fired)+"·".repeat(Math.max(0,cap-fired));
  $("fired").textContent=fired+"/"+cap;
  if((d.globalCooldownLeftMs||0)>0){$("cool").textContent="쿨다운 "+Math.ceil(d.globalCooldownLeftMs/1000)+"s";$("coolbar").style.width=Math.min(100,d.globalCooldownLeftMs/22000*100)+"%"}
  else if(fired>=cap){$("cool").textContent="상한 도달 — 이제 그냥 바라본다";$("coolbar").style.width="0%"}
  else {$("cool").textContent="열려 있음 (다음 거울 가능)";$("coolbar").style.width="0%"}
  const pend=(d.pending||[]).map(p=>"<li>▸ "+(KO[p.gesture]||p.gesture)+" · "+(p.inMs/1000).toFixed(1)+"s 뒤 · "+Math.round(p.fidelity*100)+"%</li>").join("");
  $("pending").innerHTML=pend;
  $("speak").textContent=m.speaking?"● 말하는 중":"○ 침묵";
  $("gaze").textContent="시선 "+(d.gaze||"–");
  $("say").textContent=m.lastSay?("“"+m.lastSay+"”"):"";
  $("chan").innerHTML=
    '<span class="chip '+(ch.camera?"on":"off")+'">cam '+dot(ch.camera)+'</span>'+
    '<span class="chip '+(ch.bridge?"on":"off")+'">bridge '+dot(ch.bridge)+'</span>'+
    '<span class="chip '+(ch.stream==="up"?"on":ch.stream==="down"?"down":"off")+'">stream '+(ch.stream==="up"?"●":ch.stream==="down"?"✕":"○")+'</span>'+
    '<span class="chip '+(/시작|듣/.test(ch.stt||"")?"on":"off")+'">stt</span> <span class="dim">'+(ch.stt||"–")+'</span>';
  const sig=(m.signals||[]).map(s=>'<div class="sig"><span>'+s.signal+'</span><span>·'+(s.strength||0).toFixed(2)+'</span></div>').join("");
  $("signals").innerHTML=sig||"—";
  // 세션 페이지가 죽었으면 표시 (1.5s 넘게 소식 없음)
  $("conn").innerHTML = (now-lastAt>1500)? '· <span id="stale">세션 신호 끊김</span>' : '· 연결됨';
},250);
</script></body></html>`;
