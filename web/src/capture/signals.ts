/**
 * Capture — 웹캠에서 관객의 신호만 추출한다. 프레임은 어디에도 저장/전송하지 않는다.
 *
 * FaceLandmarker(blendshapes) + PoseLandmarker 를 ~15fps 로 돌려 SignalEvent 를 방출.
 *   frown      : browDownLeft/Right 평균 > 0.45 가 400ms 지속
 *   smile      : mouthSmileLeft/Right 평균 > 0.5 가 300ms 지속
 *   chewing    : jawOpen 이 3초 창에서 4회 이상 진동 (씹는 리듬)
 *   reach_hand : 손목이 어깨보다 위 or 손목-어깨 z차로 카메라 쪽 전진
 *   lean_in    : 얼굴 bbox 폭이 2초 사이 20% 이상 증가
 *   head_tilt  : 양눈 기울기 12° 이상 600ms 지속
 *   gone       : 얼굴 미검출 4초 지속
 *
 * P1 에서 Claude Code 가 할 일: 모델 로딩 경로 확인, 디버그 오버레이 부착, 임계값 튜닝 UI.
 */

import { FaceLandmarker, PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { SignalEvent, Signal } from "@contract/contract";

/* 전시장 인터넷을 신뢰하지 않는다 — 로컬(public/) 우선, CDN 은 폴백 */
const WASM_LOCAL = "/vendor/mediapipe-wasm"; // postinstall 이 npm 패키지에서 복사
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const FACE_MODEL_LOCAL = "/models/face_landmarker.task";
const FACE_MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL_LOCAL = "/models/pose_landmarker_lite.task";
const POSE_MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

async function firstReachable(local: string, probe: string, cdn: string): Promise<string> {
  try {
    const r = await fetch(probe, { method: "HEAD" });
    // dev 서버의 SPA 폴백(HTML 200)에 속지 않는다 — 진짜 파일일 때만 로컬
    const html = (r.headers.get("content-type") ?? "").includes("text/html");
    if (r.ok && !html) return local;
  } catch { /* 로컬 없음 → CDN */ }
  return cdn;
}

type Emit = (s: SignalEvent) => void;

interface Sustain { since: number; active: boolean }
const sustain = (): Sustain => ({ since: 0, active: false });

export class SignalCapture {
  private video: HTMLVideoElement;
  private emit: Emit;
  private face?: FaceLandmarker;
  private pose?: PoseLandmarker;
  private raf = 0;
  private lastTick = 0;
  private running = false;

  // 지속시간 게이트
  private sFrown = sustain();
  private sSmile = sustain();
  private sTilt = sustain();
  // chewing: jawOpen 시계열
  private jawHist: { t: number; v: number }[] = [];
  private lastChewEmit = 0;
  // lean_in: bbox 폭 시계열
  private widthHist: { t: number; w: number }[] = [];
  private lastLean = 0;
  // gone
  private lastFaceSeen = Date.now();
  private goneEmitted = false;
  // reach
  private lastReach = 0;

  constructor(video: HTMLVideoElement, emit: Emit) {
    this.video = video;
    this.emit = emit;
  }

  async init() {
    const [wasmBase, faceModel, poseModel] = await Promise.all([
      firstReachable(WASM_LOCAL, `${WASM_LOCAL}/vision_wasm_internal.js`, WASM_CDN),
      firstReachable(FACE_MODEL_LOCAL, FACE_MODEL_LOCAL, FACE_MODEL_CDN),
      firstReachable(POSE_MODEL_LOCAL, POSE_MODEL_LOCAL, POSE_MODEL_CDN),
    ]);
    const fileset = await FilesetResolver.forVisionTasks(wasmBase);
    this.face = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: faceModel, delegate: "GPU" },
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      numFaces: 1,
    });
    this.pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: poseModel, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  start() { this.running = true; this.loop(); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastTick < 66) return; // ~15fps
    this.lastTick = now;
    if (this.video.readyState < 2) return;
    this.tick(Date.now(), now);
  };

  private tick(t: number, vts: number) {
    const bs = new Map<string, number>();
    let faceBox: { w: number } | null = null;

    const fr = this.face?.detectForVideo(this.video, vts);
    const shapes = fr?.faceBlendshapes?.[0]?.categories;
    if (shapes && fr?.faceLandmarks?.[0]) {
      for (const c of shapes) bs.set(c.categoryName, c.score);
      const lm = fr.faceLandmarks[0];
      let minX = 1, maxX = 0;
      for (const p of lm) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
      faceBox = { w: maxX - minX };
      this.lastFaceSeen = t;
      this.goneEmitted = false;
    } else if (t - this.lastFaceSeen > 4000 && !this.goneEmitted) {
      this.goneEmitted = true;
      this.emit({ signal: "gone", t, strength: 1 });
    }

    if (bs.size) {
      this.gateSustain("frown", t, avg(bs, "browDownLeft", "browDownRight"), 0.45, 400, this.sFrown);
      this.gateSustain("smile", t, avg(bs, "mouthSmileLeft", "mouthSmileRight"), 0.5, 300, this.sSmile);
      this.detectChewing(t, bs.get("jawOpen") ?? 0);
      this.detectTilt(t, fr!.faceLandmarks[0]);
    }
    if (faceBox) this.detectLean(t, faceBox.w);

    const pr = this.pose?.detectForVideo(this.video, vts);
    const p = pr?.landmarks?.[0];
    if (p) this.detectReach(t, p);
  }

  /** 임계 초과가 ms 이상 지속되면 1회 방출 (내려갈 때 리셋) */
  private gateSustain(signal: Signal, t: number, v: number, th: number, ms: number, s: Sustain) {
    if (v > th) {
      if (!s.since) s.since = t;
      if (!s.active && t - s.since >= ms) {
        s.active = true;
        this.emit({ signal, t, strength: Math.min(1, v) });
      }
    } else { s.since = 0; s.active = false; }
  }

  private detectChewing(t: number, jaw: number) {
    this.jawHist.push({ t, v: jaw });
    this.jawHist = this.jawHist.filter((h) => t - h.t < 3000);
    if (t - this.lastChewEmit < 3000 || this.jawHist.length < 12) return;
    // 평균선 교차 횟수로 진동 감지
    const mean = this.jawHist.reduce((a, h) => a + h.v, 0) / this.jawHist.length;
    if (mean < 0.04 || mean > 0.5) return; // 다물었거나 크게 벌린 상태는 씹기가 아님
    let cross = 0;
    for (let i = 1; i < this.jawHist.length; i++) {
      const a = this.jawHist[i - 1].v - mean, b = this.jawHist[i].v - mean;
      if (a * b < 0) cross++;
    }
    if (cross >= 4) {
      this.lastChewEmit = t;
      this.emit({ signal: "chewing", t, strength: Math.min(1, cross / 8) });
    }
  }

  private detectTilt(t: number, lm: { x: number; y: number }[]) {
    // 33: 오른눈 바깥, 263: 왼눈 바깥 (FaceLandmarker 468 인덱스)
    const r = lm[33], l = lm[263];
    if (!r || !l) return;
    const deg = Math.abs((Math.atan2(l.y - r.y, l.x - r.x) * 180) / Math.PI);
    this.gateSustain("head_tilt", t, deg > 12 ? 1 : 0, 0.5, 600, this.sTilt);
  }

  private detectLean(t: number, w: number) {
    this.widthHist.push({ t, w });
    this.widthHist = this.widthHist.filter((h) => t - h.t < 2200);
    if (t - this.lastLean < 8000 || this.widthHist.length < 8) return;
    const first = this.widthHist[0].w, last = w;
    if (first > 0.02 && last / first > 1.2) {
      this.lastLean = t;
      this.emit({ signal: "lean_in", t, strength: Math.min(1, last / first - 1) });
    }
  }

  private detectReach(t: number, p: { x: number; y: number; z: number; visibility?: number }[]) {
    if (t - this.lastReach < 6000) return;
    // 15/16: 손목, 11/12: 어깨
    for (const [wrist, shoulder] of [[15, 11], [16, 12]] as const) {
      const w = p[wrist], s = p[shoulder];
      if (!w || !s || (w.visibility ?? 1) < 0.5) continue;
      const raised = w.y < s.y - 0.05;               // 손목이 어깨 위
      const forward = w.z < s.z - 0.15;              // 카메라 쪽으로 전진
      if (raised || forward) {
        this.lastReach = t;
        this.emit({ signal: "reach_hand", t, strength: forward ? 0.9 : 0.6 });
        return;
      }
    }
  }
}

function avg(m: Map<string, number>, ...keys: string[]) {
  return keys.reduce((a, k) => a + (m.get(k) ?? 0), 0) / keys.length;
}
