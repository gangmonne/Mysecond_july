/**
 * ClipBankRenderer — 사전 렌더된 고화질 메타휴먼 클립을 FMV 방식으로 재생하는 몸.
 * three.js 실시간 렌더 대신, 화질은 UE 오프라인 렌더에서 확보하고
 * 실시간성은 상태 머신 + 이중 <video> 크로스페이드로 양자화한다.
 *
 * 클립 규약 (UE 시퀀서에서 렌더해 /public/clips/ 에 배치):
 *   idle_a.webm idle_b.webm idle_c.webm   — 3~6초 루프, 미세하게 다른 호흡
 *   talk_loop.webm                        — 발화 루프 (desync 는 자막 시작점과의 차이로 발생)
 *   gaze_face.webm gaze_plate.webm gaze_away.webm — 시선 전환 (eyes lead head 로 미리 애니메이팅)
 *   frown.webm smile.webm reach_hand.webm lean_in.webm head_tilt.webm — 몸짓 (원위치 복귀 포함)
 *   eat_mimic.webm                        — 수저가 입 앞에서 멈추는 그 비트
 *
 * fidelity 열화 표현: playbackRate(0.88~1.0) + opacity + CSS 글리치 클래스 강도.
 * 클립이 없으면 자리표시 카드(상태명 텍스트)로 대체해 파이프라인을 먼저 굴린다.
 */

import type { Action, MirrorEvent, GazeTarget } from "@contract/contract";

export interface Renderer {
  perform(a: Action): void;
  mirror(m: MirrorEvent): void;
  gaze(g: GazeTarget): void;
  setSpeakingListener(cb: (speaking: boolean) => void): void;
}

type State =
  | { kind: "idle" }
  | { kind: "talk" }
  | { kind: "gesture"; name: string }
  | { kind: "gaze"; target: GazeTarget };

const IDLES = ["idle_a", "idle_b", "idle_c"];

export class ClipBankRenderer implements Renderer {
  private layers: [HTMLVideoElement, HTMLVideoElement];
  private front = 0;
  private root: HTMLElement;
  private placeholder: HTMLElement;
  private state: State = { kind: "idle" };
  private speakingCb: (s: boolean) => void = () => {};
  private queue: (() => void)[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    root.style.position = "relative";
    this.layers = [document.createElement("video"), document.createElement("video")] as const as [
      HTMLVideoElement, HTMLVideoElement,
    ];
    for (const v of this.layers) {
      Object.assign(v, { muted: true, playsInline: true });
      Object.assign(v.style, {
        position: "absolute", inset: "0", width: "100%", height: "100%",
        objectFit: "cover", transition: "opacity 480ms ease", opacity: "0",
      });
      root.appendChild(v);
    }
    this.placeholder = document.createElement("div");
    Object.assign(this.placeholder.style, {
      position: "absolute", inset: "0", display: "flex", alignItems: "center",
      justifyContent: "center", color: "#8C8072", fontSize: "13px", letterSpacing: "0.12em",
    });
    root.appendChild(this.placeholder);
    this.idle();
  }

  setSpeakingListener(cb: (s: boolean) => void) { this.speakingCb = cb; }

  perform(a: Action) {
    // desync: 자막은 앱 셸이 즉시 시작, 몸은 desync_ms 뒤에 talk 루프로 진입
    setTimeout(() => {
      this.speakingCb(true);
      this.play("talk_loop", { loop: true });
      // 대사 길이 기반 근사 발화 시간 (전시에선 TTS 오디오 길이로 교체)
      const ms = Math.max(1400, a.say.length * 145);
      setTimeout(() => {
        this.speakingCb(false);
        if (a.eat_mimic) this.gesture("eat_mimic", 1);
        else this.idle();
      }, ms);
    }, a.glitch.desync_ms + a.glitch.expr_freeze * 1200);
    if (a.gaze !== "face") setTimeout(() => this.gaze(a.gaze), a.glitch.desync_ms);
    this.root.style.setProperty("--tb", String(a.glitch.texture_break));
  }

  mirror(m: MirrorEvent) {
    // 지연은 director 가 이미 소화했다 — 여기선 열화만 표현한다
    this.gesture(m.gesture, m.fidelity);
  }

  gaze(target: GazeTarget) {
    if (this.state.kind === "talk" || this.state.kind === "gesture") return;
    this.state = { kind: "gaze", target };
    this.play(`gaze_${target}`, { loop: false, onEnd: () => this.idle() });
  }

  private gesture(name: string, fidelity: number) {
    const run = () => {
      this.state = { kind: "gesture", name };
      const v = this.play(name, {
        loop: false,
        rate: 0.88 + 0.12 * fidelity,
        onEnd: () => { this.state = { kind: "idle" }; this.idle(); this.drain(); },
      });
      if (v) v.style.opacity = String(0.72 + 0.28 * fidelity);
      this.root.dataset.glitch = fidelity < 0.55 ? "strong" : "soft";
    };
    if (this.state.kind === "talk" || this.state.kind === "gesture") this.queue.push(run);
    else run();
  }

  private drain() { const f = this.queue.shift(); if (f) f(); }

  private idle() {
    this.state = { kind: "idle" };
    const pick = IDLES[Math.floor(Math.random() * IDLES.length)];
    this.play(pick, { loop: true });
  }

  private play(clip: string, opt: { loop?: boolean; rate?: number; onEnd?: () => void } = {}) {
    const back = this.layers[1 - this.front];
    const src = `/clips/${clip}.webm`;
    back.loop = !!opt.loop;
    back.playbackRate = opt.rate ?? 1;
    back.onended = opt.onEnd ? () => opt.onEnd!() : null;
    back.onerror = () => {
      // 클립이 아직 없다 — 자리표시로 상태만 노출하고 파이프라인은 계속 굴린다
      this.placeholder.textContent = `[ ${clip} ]`;
      if (opt.onEnd) setTimeout(opt.onEnd, 1600);
    };
    back.src = src;
    back.play().catch(() => {});
    back.style.opacity = "1";
    this.layers[this.front].style.opacity = "0";
    this.front = 1 - this.front;
    this.placeholder.textContent = "";
    return back;
  }
}
