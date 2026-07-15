/**
 * SpatialRenderer — 몸을 '형상(3D)'으로 세우는 플레이스홀더 렌더러.
 *
 * 왜 talk_loop(2D 클립) 대신 spatial 인가:
 *   나중에 표정을 실시간으로 얹으려면(웹캠 blendshape → 얼굴), 평면 영상보다
 *   회전·조명·깊이를 가진 3D 형상이 훨씬 자연스럽게 연동된다. gaze 는 목의 회전으로,
 *   발화는 얼굴 진동으로, fidelity 열화는 형상의 흔들림/탈색으로 표현된다.
 *
 * 소스 우선순위:
 *   1) manifest.mesh (GLB URL/경로) — Higgsfield image_to_3d 스캔 등. 로드되면 그 머리를 쓴다.
 *   2) 폴백: 외부 파일 없이 코드로 만드는 점군(point cloud) 두상 — 절대 404 나지 않는다.
 *      어둠 속에 떠 있는 '형상'. aura 미학과 이어진다.
 *
 * hi-fi 본선은 여전히 UE Pixel Streaming 이다 (CLAUDE.md). 이건 리허설/웹 배포용 몸.
 * WebGL 이 없으면 생성자가 throw → 앱 셸이 클립뱅크로 폴백한다.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Action, MirrorEvent, GazeTarget } from "@contract/contract";
import type { Renderer } from "./clipbank";

const GAZE_YAW: Record<GazeTarget, number> = { face: 0, plate: 0.15, away: 0.7 };
const GAZE_PITCH: Record<GazeTarget, number> = { face: 0, plate: 0.32, away: 0.08 };

export class SpatialRenderer implements Renderer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private gl: THREE.WebGLRenderer;
  private head = new THREE.Group();
  private raf = 0;
  private speakingCb: (s: boolean) => void = () => {};

  // 목표/현재 상태 (프레임마다 부드럽게 수렴)
  private tgtYaw = 0;
  private tgtPitch = 0;
  private yaw = 0;
  private pitch = 0;
  private speaking = 0;   // 0..1 발화 진동
  private agitation = 0;  // 몸짓/열화 순간 흔들림 (감쇠)
  private desat = 0;      // 열화에 따른 탈색 0..1
  private points?: THREE.Points; // 폴백 점군

  constructor(private root: HTMLElement, mesh?: string) {
    const w = root.clientWidth || 1280;
    const h = root.clientHeight || 720;

    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h);
    Object.assign(this.gl.domElement.style, {
      position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: "1",
    });
    root.appendChild(this.gl.domElement);

    this.camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 4.2);

    // 낮고 따뜻한 키 라이트 + 미세한 채움 (콜드 오픈 톤)
    const key = new THREE.DirectionalLight(0xffe8cc, 1.5);
    key.position.set(1.4, 1.2, 2.2);
    const fill = new THREE.DirectionalLight(0x334455, 0.5);
    fill.position.set(-2, -0.5, 1);
    this.scene.add(key, fill, new THREE.AmbientLight(0x1a1712, 0.6));
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
        const scale = 2.2 / Math.max(size.x, size.y, size.z || 1);
        obj.position.sub(center).multiplyScalar(scale);
        obj.scale.setScalar(scale);
        this.points?.removeFromParent(); // 진짜 머리가 왔으니 폴백 점군은 물러난다
        this.points = undefined;
        this.head.add(obj);
      },
      undefined,
      () => { /* 로드 실패 — 폴백 점군을 그대로 둔다 */ },
    );
  }

  /** 외부 파일 없이 코드로 만드는 점군 두상 — 어둠 속의 형상 */
  private buildFallbackHead() {
    const N = 4200;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // 살짝 눌린 타원구(머리) + 아래로 뻗은 목/어깨 암시
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      let x = Math.sin(phi) * Math.cos(theta);
      let y = Math.cos(phi);
      let z = Math.sin(phi) * Math.sin(theta) * 0.82;
      x *= 0.82; y *= 1.02;
      if (y < -0.5) { x *= 1.3; z *= 1.3; } // 어깨로 퍼짐
      const jitter = 0.02;
      pos[i * 3] = x + (Math.random() - 0.5) * jitter;
      pos[i * 3 + 1] = y + (Math.random() - 0.5) * jitter;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * jitter;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.018, color: 0xb9a488, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.head.add(this.points);
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

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = performance.now() / 1000;

    // 시선: 목표로 부드럽게 수렴 + 미세한 부유
    this.yaw += (this.tgtYaw - this.yaw) * 0.05;
    this.pitch += (this.tgtPitch - this.pitch) * 0.05;
    const breath = Math.sin(t * 1.1) * 0.02;
    const speakJitter = this.speaking ? Math.sin(t * 34) * 0.012 : 0;
    const shake = this.agitation * (Math.random() - 0.5) * 0.1;

    this.head.rotation.y = this.yaw + Math.sin(t * 0.4) * 0.03 + shake;
    this.head.rotation.x = this.pitch + breath + speakJitter;
    this.head.scale.setScalar(1 + breath * 0.5 + this.speaking * 0.01);
    this.agitation *= 0.94;
    this.desat *= 0.995;

    if (this.points) {
      const m = this.points.material as THREE.PointsMaterial;
      // 열화 → 탈색(따뜻한 색에서 회색으로) + 크기 흔들림
      const c = new THREE.Color(0xb9a488).lerp(new THREE.Color(0x8a8a8a), this.desat);
      m.color.copy(c);
      m.size = 0.018 + this.agitation * 0.01;
      this.points.rotation.z = Math.sin(t * 0.2) * 0.02;
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
