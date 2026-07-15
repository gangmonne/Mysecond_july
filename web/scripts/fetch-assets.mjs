/**
 * fetch-assets — manifest.json 의 원격(http) 소스를 public/clips/ 로 내려받아
 * 로컬 경로로 고정한다. CDN URL 은 임시라 만료되면 "file not found" 가 뜨므로,
 * 전시/로컬 구동 전에 한 번 돌려 자산을 레포 안으로 들여놓는다.
 *
 *   npm run assets:fetch            # manifest 의 poster/clips/mesh 를 로컬로
 *   npm run assets:fetch -- --keep  # manifest 는 그대로 두고 파일만 받기(원본 보존)
 *
 * 이 환경(에이전트 샌드박스)은 외부 CDN 이 막혀 있어 여기선 실패할 수 있다 —
 * 인터넷이 되는 로컬 머신에서 돌리면 된다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const manifestPath = fileURLToPath(new URL("../public/clips/manifest.json", import.meta.url));
const clipsDir = path.dirname(manifestPath);
const keep = process.argv.includes("--keep");

const raw = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(raw);
await mkdir(clipsDir, { recursive: true });

const seen = new Map(); // url → 로컬 경로 (같은 URL 은 한 번만 받는다)
let count = 0;

/** URL 이면 받아서 로컬 상대경로(/clips/…)를 돌려준다. 아니면 그대로. */
async function localize(url, hint) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return url;
  if (seen.has(url)) return seen.get(url);
  const ext = (path.extname(new URL(url).pathname) || guessExt(url)).replace(/[^.a-z0-9]/gi, "") || ".bin";
  const name = `${hint}${ext}`;
  const dest = path.join(clipsDir, name);
  process.stdout.write(`↓ ${hint}${ext}  … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  process.stdout.write(`${(buf.length / 1024 / 1024).toFixed(1)}MB\n`);
  const local = `/clips/${name}`;
  seen.set(url, local);
  count++;
  return local;
}

function guessExt(url) {
  if (/\.glb(\?|$)/i.test(url)) return ".glb";
  if (/\.mp4(\?|$)/i.test(url)) return ".mp4";
  if (/\.webm(\?|$)/i.test(url)) return ".webm";
  if (/\.png(\?|$)/i.test(url)) return ".png";
  if (/\.jpe?g(\?|$)/i.test(url)) return ".jpg";
  return ".bin";
}

const out = { ...manifest };
if (manifest.poster) out.poster = await localize(manifest.poster, "poster");
if (manifest.mesh) out.mesh = await localize(manifest.mesh, "mesh");
if (manifest.clips) {
  out.clips = {};
  for (const [state, url] of Object.entries(manifest.clips)) {
    out.clips[state] = await localize(url, state);
  }
}

if (!keep) {
  await writeFile(manifestPath, JSON.stringify(stripComment(out), null, 2) + "\n", "utf8");
  console.log(`\n✓ ${count}개 자산을 public/clips/ 로 받고 manifest 를 로컬 경로로 갱신했습니다.`);
} else {
  console.log(`\n✓ ${count}개 자산을 public/clips/ 로 받았습니다 (manifest 는 --keep 로 보존).`);
}

function stripComment(m) {
  const { _comment, ...rest } = m;
  return rest;
}
