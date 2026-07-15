/**
 * SpatialRenderer — 몸을 '형상(3D)'으로 세우는 렌더러.
 *
 * 왜 talk_loop(2D 클립) 대신 spatial 인가:
 *   표정을 실시간으로 얹으려면(웹캠 blendshape → 얼굴) 평면 영상보다
 *   회전·조명·깊이를 가진 3D 형상이 자연스럽다. gaze 는 목의 회전으로,
 *   발화는 턱의 진동으로, fidelity 열화는 형상의 흔들림/탈색으로 표현된다.
 *
 * 소스 우선순위:
 *   1) manifest.mesh (GLB) — Higgsfield image_to_3d 스캔. 리깅된 GLB 면
 *      jaw/head/neck 본을 찾아 표정을 본으로 구동한다.
 *   2) 폴백: 코드로 만드는 점군(point cloud) 두상 — 절대 404 나지 않는다.
 *      턱 점군이 분리돼 있어 jawOpen 이 실제로 벌어진다.
 *
 * 표정 채널 (capture 의 FaceFrame):
 *   expression(f, w)          — 라이브 구동 (리허설 ?live=1 전용. 본 세션에선 직결 금지 —
 *                               정확한 미러링은 이 작품에서 실패다)
 *   replayExpression(frames, fidelity) — 거울 이벤트: 그때의 표정 스니펫을
 *                               뒤늦게, fidelity 만큼만, 느리게 재생한다. 이것이 본선.
 *
 * hi-fi 본선은 여전히 UE Pixel Streaming (CLAUDE.md). 이건 리허설/웹 배포용 몸.
 * WebGL 이 없으면 생성자가 throw → 앱 셸이 클립뱅크로 폴백한다.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Action, MirrorEvent, GazeTarget } from "@contract/contract";
import type { Renderer } from "./clipbank";
import type { FaceFrame } from "../capture/signals";

const GAZE_YAW: Record<GazeTarget, number> = { face: 0, plate: 0.15, away: 0.7 };
const GAZE_PITCH: Record<GazeTarget, number> = { face: 0, plate: 0.32, away: 0.08 };

/** 표정 목표값 (프레임마다 현재값이 이쪽으로 수렴) */
interface Expr { jaw: number; smile: number; brow: number; yaw: number; pitch: number; roll: number }
const EXPR_ZERO: Expr = { jaw: 0, smile: 0, brow: 0, yaw: 0, pitch: 0, roll: 0 };

interface Replay { frames: FaceFrame[]; startedAt: number; rate: number; weight: number }

export class SpatialRenderer implements Renderer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private gl: THREE.WebGLRenderer;
  private head = new THREE.Group();
  private raf = 0;
  private speakingCb: (s: boolean) => void = () => {};

  // 시선/상태 (프레임마다 부드럽게 수렴)
  private tgtYaw = 0;
  private tgtPitch = 0;
  private yaw = 0;
  private pitch = 0;
  private speaking = 0;   // 0..1 발화 진동
  private agitation = 0;  // 몸짓/열화 순간 흔들림 (감쇠)
  private desat = 0;      // 열화에 따른 탈색 0..1

  // 표정 채널
  private exprTgt: Expr = { ...EXPR_ZERO };
  private expr: Expr = { ...EXPR_ZERO };
  private exprWeight = 0;
  private replay: Replay | null = null;

  // 폴백 점군 (두개 + 분리된 턱)
  private skull?: THREE.Points;
  private jawGroup?: THREE.Group;
  // 리깅 GLB 본
  private boneJaw?: THREE.Bone;
  private boneHead?: THREE.Bone;
  private boneJawRest?: THREE.Quaternion;
  private boneHeadRest?: THREE.Quaternion;

  constructor(private root: HTMLElement, mesh?: string) {
    const w = root.clientWidth || 1280;
    const h = root.clientHeight || 720;

    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h);
    // 필름 톤 — 시네마틱 레이어(그레인/비네트)와 같은 색 세계
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    Object.assign(this.gl.domElement.style, {
      position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: "1",
    });
    root.appendChild(this.gl.domElement);

    // 프레이밍: 상반신 초상 — 카메라가 아주 살짝 위에서 내려다본다
    this.camera = new THREE.PerspectiveCamera(26, w / h, 0.1, 100);
    this.camera.position.set(0, 0.28, 3.9);
    this.camera.lookAt(0, 0.02, 0);

    // 조명: 따뜻한 사이드 키 + 차가운 림 + 낮은 채움 — 콜드 오픈의 다과상 톤
    const key = new THREE.DirectionalLight(0xffdfb8, 2.1);
    key.position.set(1.6, 1.1, 1.8);
    const rim = new THREE.DirectionalLight(0x7f93b8, 1.1);
    rim.position.set(-1.2, 0.6, -1.6);
    const fill = new THREE.DirectionalLight(0x2c343f, 0.45);
    fill.position.set(-1.8, -0.4, 1.2);
    this.scene.add(key, rim, fill, new THREE.AmbientLight(0x191512, 0.7));

    this.head.position.y = 0.05;
    this.scene.add(this.head);

    if (mesh) this.loadMesh(mesh); // 실패해도 아래 폴백이 이미 서 있다
    this.buildFallbackHead();

    window.addEventListener("resize", this.onResize);
    this.loop();
  }

  private onResize = () => {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h);
  };

  private loadMesh(url: string) {
    new GLTFLoader().load(
      url,
      (gltf) => {
        // 스캔 머리를 화면에 맞춰 정규화(중심 이동 + 크기 정규화)
        const obj = gltf.scene;
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 2.1 / Math.max(size.x, size.y, size.z || 1);
        obj.position.sub(center).multiplyScalar(scale);
        obj.scale.setScalar(scale);
        // 리깅돼 있으면 표정용 본을 찾아 둔다 (③ rigged GLB)
        obj.traverse((n) => {
          if ((n as THREE.Bone).isBone) {
            const name = n.name.toLowerCase();
            if (!this.boneJaw && /jaw|chin/.test(name)) this.boneJaw = n as THREE.Bone;
            if (!this.boneHead && /head/.test(name)) this.boneHead = n as THREE.Bone;
          }
        });
        this.boneJawRest = this.boneJaw?.quaternion.clone();
        this.boneHeadRest = this.boneHead?.quaternion.clone();
        // 진짜 머리가 왔으니 폴백 점군은 물러난다
        this.skull?.removeFromParent();
        this.jawGroup?.removeFromParent();
        this.skull = undefined;
        this.jawGroup = undefined;
        this.head.add(obj);
      },
      undefined,
      () => { /* 로드 실패 — 폴백 점군을 그대로 둔다 */ },
    );
  }

  /** 외부 파일 없이 코드로 만드는 점군 두상 — 턱이 분리돼 있어 말할 수 있다 */
  private buildFallbackHead() {
    const skullPos: number[] = [];
    const jawPos: number[] = [];
    const JAW_PIVOT_Y = -0.32;
    for (let i = 0; i < 4600; i++) {
      // 살짝 눌린 타원구(머리) + 아래로 퍼지는 어깨 암시
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      let x = Math.sin(phi) * Math.cos(theta) * 0.82;
      let y = Math.cos(phi) * 1.02;
      let z = Math.sin(phi) * Math.sin(theta) * 0.82;
      if (y < -0.5) { x *= 1.3; z *= 1.3; }
      const j = 0.02;
      x += (Math.random() - 0.5) * j; y += (Math.random() - 0.5) * j; z += (Math.random() - 0.5) * j;
      // 아래 앞쪽 = 턱 (분리 회전을 위해 피벗 기준 좌표로 저장)
      if (y < JAW_PIVOT_Y * 0.7 && y > -0.62 && z > 0.12) jawPos.push(x, y - JAW_PIVOT_Y, z);
      else skullPos.push(x, y, z);
    }
    const mat = () => new THREE.PointsMaterial({
      size: 0.018, color: 0xb9a488, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const geo = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(arr), 3));
      return g;
    };
    this.skull = new THREE.Points(geo(skullPos), mat());
    const jawPts = new THREE.Points(geo(jawPos), mat());
    this.jawGroup = new THREE.Group();
    this.jawGroup.position.y = JAW_PIVOT_Y;
    this.jawGroup.add(jawPts);
    this.head.add(this.skull, this.jawGroup);
  }

  /* ── Renderer 계약 ── */
  setSpeakingListener(cb: (s: boolean) => void) { this.speakingCb = cb; }

  perform(a: Action) {
    this.desat = Math.max(this.desat, a.glitch.texture_break);
    setTimeout(() => {
      this.speaking = 1;
      this.speakingCb(true);
      const ms = Math.max(1400, a.say.length * 145);
      setTimeout(() => { this.speaking = 0; this.speakingCb(false); }, ms);
    }, a.glitch.desync_ms + a.glitch.expr_freeze * 1200);
    if (a.gaze !== "face") setTimeout(() => this.gaze(a.gaze), a.glitch.desync_ms);
  }

  mirror(m: MirrorEvent) {
    // 열화가 심할수록 더 흔들리고 더 탈색된다 — 완벽한 복제는 버그다
    this.agitation = Math.min(1, this.agitation + (1 - m.fidelity) * 0.9 + 0.2);
    this.desat = Math.max(this.desat, 1 - m.fidelity);
  }

  gaze(target: GazeTarget) {
    this.tgtYaw = GAZE_YAW[target];
    this.tgtPitch = GAZE_PITCH[target];
  }

  /* ── 표정 채널 ── */

  /** 라이브 구동 (리허설 전용) — FaceFrame 을 weight 만큼 얼굴에 얹는다 */
  expression(f: FaceFrame, weight = 1) {
    this.exprTgt = {
      jaw: f.jaw, smile: f.smile, brow: f.brow,
      yaw: -f.yaw, pitch: f.pitch, roll: -f.roll, // 거울이므로 좌우 반전
    };
    this.exprWeight = weight;
  }

  /**
   * 지연 재생 — 관객이 그 몸짓을 하던 순간의 표정 스니펫을
   * fidelity 만큼의 진폭으로, fidelity 가 낮을수록 더 느리게 재생한다.
   */
  replayExpression(frames: FaceFrame[], fidelity: number) {
    if (!frames.length) return;
    this.replay = {
      frames,
      startedAt: performance.now(),
      rate: 0.55 + 0.45 * fidelity, // 열화될수록 더 느린 복제
      weight: fidelity,
    };
  }

  /** 재생 중이면 현재 시점 프레임을 보간해 exprTgt 에 얹는다 */
  private stepReplay() {
    if (!this.replay) return;
    const { frames, startedAt, rate, weight } = this.replay;
    const t0 = frames[0].t;
    const elapsed = (performance.now() - startedAt) * rate;
    const tNow = t0 + elapsed;
    const last = frames[frames.length - 1];
    if (tNow >= last.t) {
      this.replay = null;
      this.exprTgt = { ...EXPR_ZERO }; // 끝나면 무표정으로 가라앉는다
      return;
    }
    let i = 0;
    while (i < frames.length - 1 && frames[i + 1].t < tNow) i++;
    const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
    const k = b.t > a.t ? (tNow - a.t) / (b.t - a.t) : 0;
    const mix = (x: number, y: number) => x + (y - x) * k;
    this.exprTgt = {
      jaw: mix(a.jaw, b.jaw), smile: mix(a.smile, b.smile), brow: mix(a.brow, b.brow),
      yaw: -mix(a.yaw, b.yaw), pitch: mix(a.pitch, b.pitch), roll: -mix(a.roll, b.roll),
    };
    this.exprWeight = weight;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = performance.now() / 1000;

    this.stepReplay();

    // 표정: 목표로 수렴 (붙는 건 다소 빠르게, 떨어지는 건 느리게 — 여운)
    const w = this.exprWeight;
    for (const k of Object.keys(this.expr) as (keyof Expr)[]) {
      const target = this.exprTgt[k] * w;
      const rate = Math.abs(target) > Math.abs(this.expr[k]) ? 0.16 : 0.05;
      this.expr[k] += (target - this.expr[k]) * rate;
    }

    // 시선: 목표로 부드럽게 수렴 + 미세한 부유 + 표정의 머리 자세
    this.yaw += (this.tgtYaw - this.yaw) * 0.05;
    this.pitch += (this.tgtPitch - this.pitch) * 0.05;
    const breath = Math.sin(t * 1.1) * 0.02;
    const speakJaw = this.speaking ? (Math.sin(t * 26) * 0.5 + 0.5) * 0.35 : 0;
    const shake = this.agitation * (Math.random() - 0.5) * 0.1;

    this.head.rotation.y = this.yaw + this.expr.yaw * 0.8 + Math.sin(t * 0.4) * 0.03 + shake;
    this.head.rotation.x = this.pitch + this.expr.pitch * 0.6 + breath;
    this.head.rotation.z = this.expr.roll * 0.5;
    this.head.scale.setScalar(1 + breath * 0.5);
    this.agitation *= 0.94;
    this.desat *= 0.995;

    // 턱: 발화 진동 + 표정 jawOpen — 점군이면 분리 턱 회전, 리깅 GLB 면 본 회전
    const jawOpen = Math.min(1, speakJaw + this.expr.jaw);
    if (this.jawGroup) this.jawGroup.rotation.x = jawOpen * 0.45;
    if (this.boneJaw && this.boneJawRest) {
      this.boneJaw.quaternion.copy(this.boneJawRest);
      this.boneJaw.rotateX(jawOpen * 0.35);
    }
    if (this.boneHead && this.boneHeadRest) {
      this.boneHead.quaternion.copy(this.boneHeadRest);
      this.boneHead.rotateZ(this.expr.roll * 0.3);
    }

    // 점군 재질: 열화 → 탈색, 찡그림 → 어두워짐, 웃음 → 미세하게 밝아짐
    for (const pts of [this.skull, this.jawGroup?.children[0] as THREE.Points | undefined]) {
      if (!pts) continue;
      const m = pts.material as THREE.PointsMaterial;
      const c = new THREE.Color(0xb9a488).lerp(new THREE.Color(0x8a8a8a), this.desat);
      c.offsetHSL(0, 0, this.expr.smile * 0.06 - this.expr.brow * 0.08);
      m.color.copy(c);
      m.size = 0.018 + this.agitation * 0.01;
    }

    this.gl.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.gl.dispose();
    this.gl.domElement.remove();
  }
}

/** WebGL 가용성 — 없으면 SpatialRenderer 를 만들지 않는다 */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
