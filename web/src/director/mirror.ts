/**
 * Mirror Director — 이 프로젝트의 미학적 본체.
 *
 * 관객의 신호를 받아서:
 *   1) 대부분 무시한다        (ignoreProb — 신호마다 다르다. 흔한 몸짓일수록 더 무시한다)
 *   2) 아주 뒤늦게 반응한다    (delay — 수 초에서 수십 초. 늦음 자체가 대사다)
 *   3) 불완전하게 따라 한다    (fidelity — 완벽한 미러링은 이 작품에서 버그다)
 *   4) 드물게만 반응한다      (전역 쿨다운 + 몸짓별 쿨다운 + 세션 상한)
 *
 * chewing 은 거울 대상이 아니다 — 주시(注視) 대상이다. onGazeHint 로 분리 방출.
 * 모든 난수는 시드 가능 (리허설 재현).
 */

import type { SignalEvent, MirrorEvent, Signal, Gesture, GazeTarget } from "@contract/contract";

/* 시드 가능한 RNG (mulberry32) */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MirrorConfig {
  /** 신호별 무시 확률 0..1 — 흔할수록 높게 */
  ignoreProb: Record<Gesture, number>;
  /** 지연 범위 [min,max] ms — 뻗은 손엔 조금 빨리, 표정엔 아주 늦게 */
  delayRange: Record<Gesture, [number, number]>;
  /** 열화 범위 [min,max] */
  fidelityRange: [number, number];
  /** 전역 쿨다운 — 이 시간 안에 두 번 반응하지 않는다 */
  globalCooldownMs: number;
  /** 같은 몸짓의 재반응 금지 시간 */
  perGestureCooldownMs: number;
  /** 세션당 거울 반응 상한 — 희소해야 귀하다 */
  sessionCap: number;
}

export const DEFAULT_MIRROR_CONFIG: MirrorConfig = {
  ignoreProb: {
    frown: 0.85,
    smile: 0.9,
    reach_hand: 0.45, // 손을 뻗는 건 드문 일이니까, 세컨도 조금 더 응한다
    lean_in: 0.8,
    head_tilt: 0.85,
  },
  delayRange: {
    frown: [6000, 18000],
    smile: [8000, 20000],
    reach_hand: [2500, 7000],
    lean_in: [4000, 12000],
    head_tilt: [5000, 15000],
  },
  fidelityRange: [0.35, 0.85],
  globalCooldownMs: 22000,
  perGestureCooldownMs: 45000,
  sessionCap: 8,
};

const MIRRORABLE: ReadonlySet<Signal> = new Set(["frown", "smile", "reach_hand", "lean_in", "head_tilt"]);

export interface DirectorEvents {
  /** 지연이 끝나 실제로 몸이 움직이는 순간 */
  onMirror: (m: MirrorEvent) => void;
  /** 무시/예약/취소 등 내부 결정 — '행동 봉투' 패널 기록용 */
  onDecision?: (line: string) => void;
  /** chewing / gone 등에서 오는 시선 힌트 (거울이 아님) */
  onGazeHint?: (gaze: GazeTarget, reason: string) => void;
  /** 뇌 프롬프트 주입용 — 최근 거울 이력 요약 */
  onMemoryNote?: (note: string) => void;
}

export class MirrorDirector {
  private cfg: MirrorConfig;
  private rng: () => number;
  private ev: DirectorEvents;
  private lastFireAt = 0;
  private lastPerGesture = new Map<Gesture, number>();
  private fired = 0;
  private pending = new Map<Gesture, ReturnType<typeof setTimeout>>();
  private speaking = false; // 뇌가 발화 중이면 몸짓을 뒤로 미룬다
  private deferred: MirrorEvent[] = [];
  private chewingSince = 0;

  constructor(cfg: Partial<MirrorConfig> = {}, seed = 20260703, ev: DirectorEvents) {
    this.cfg = { ...DEFAULT_MIRROR_CONFIG, ...cfg,
      ignoreProb: { ...DEFAULT_MIRROR_CONFIG.ignoreProb, ...(cfg.ignoreProb ?? {}) },
      delayRange: { ...DEFAULT_MIRROR_CONFIG.delayRange, ...(cfg.delayRange ?? {}) },
    };
    this.rng = mulberry32(seed);
    this.ev = ev;
  }

  setConfig(patch: Partial<MirrorConfig>) { Object.assign(this.cfg, patch); }

  /** 뇌(Claude) 발화 시작/종료를 알려준다 — 말하는 중엔 몸짓을 미룬다 */
  setSpeaking(v: boolean) {
    this.speaking = v;
    if (!v) {
      const q = this.deferred.splice(0);
      for (const m of q) this.fire(m, "(발화가 끝나 미뤄둔 몸짓을 꺼낸다)");
    }
  }

  /** capture 로부터 신호를 받는 입구 */
  ingest(s: SignalEvent) {
    if (s.signal === "chewing") return this.handleChewing(s);
    if (s.signal === "gone") {
      this.ev.onGazeHint?.("away", "관객이 자리를 비웠다");
      return;
    }
    if (!MIRRORABLE.has(s.signal)) return;
    const g = s.signal as Gesture;
    const now = s.t;

    // 1) 세션 상한
    if (this.fired >= this.cfg.sessionCap) {
      return this.ev.onDecision?.(`${g}: 무시 (세션 상한 ${this.cfg.sessionCap}회 도달 — 이제 그냥 바라본다)`);
    }
    // 2) 쿨다운
    if (now - this.lastFireAt < this.cfg.globalCooldownMs)
      return this.ev.onDecision?.(`${g}: 무시 (아직 지난 몸짓의 여운 안이다)`);
    const per = this.lastPerGesture.get(g) ?? 0;
    if (now - per < this.cfg.perGestureCooldownMs)
      return this.ev.onDecision?.(`${g}: 무시 (같은 몸짓을 두 번 따라 하면 흉내가 된다)`);
    // 3) 이미 같은 몸짓이 예약돼 있으면 중복 예약 안 함
    if (this.pending.has(g))
      return this.ev.onDecision?.(`${g}: 무시 (이미 몸속 어딘가에서 준비 중)`);
    // 4) 무시 확률 — 대부분은 여기서 사라진다
    if (this.rng() < this.cfg.ignoreProb[g])
      return this.ev.onDecision?.(`${g}: 무시 (봤다. 못 본 척했다)`);

    // 5) 예약 — 지연과 열화를 뽑는다
    const [dLo, dHi] = this.cfg.delayRange[g];
    const delay = Math.round(dLo + this.rng() * (dHi - dLo));
    const [fLo, fHi] = this.cfg.fidelityRange;
    const fidelity = +(fLo + this.rng() * (fHi - fLo)).toFixed(2);
    const m: MirrorEvent = { kind: "mirror", gesture: g, source_t: now, delay_ms: delay, fidelity };

    this.ev.onDecision?.(`${g}: 예약 — ${(delay / 1000).toFixed(1)}초 뒤, ${Math.round(fidelity * 100)}% 만큼만`);
    const t = setTimeout(() => {
      this.pending.delete(g);
      if (this.speaking) {
        this.deferred.push(m);
        this.ev.onDecision?.(`${g}: 말하는 중이라 몸짓을 삼켰다 (발화 후 재생)`);
        return;
      }
      this.fire(m);
    }, delay);
    this.pending.set(g, t);
  }

  private fire(m: MirrorEvent, note?: string) {
    this.fired += 1;
    this.lastFireAt = Date.now();
    this.lastPerGesture.set(m.gesture, this.lastFireAt);
    const lateSec = ((this.lastFireAt - m.source_t) / 1000).toFixed(1);
    this.ev.onDecision?.(note ?? `${m.gesture}: 실행 — ${lateSec}초 늦은 복제 (fidelity ${m.fidelity})`);
    this.ev.onMirror(m);
    this.ev.onMemoryNote?.(
      `관객이 ${labelKo(m.gesture)} 을(를) 했고, 나는 ${lateSec}초 늦게 어설프게 따라 했다.`,
    );
  }

  /** 씹는 중 — 거울이 아니라 주시. 시선이 접시와 얼굴 사이를 오간다 */
  private handleChewing(s: SignalEvent) {
    const now = s.t;
    if (now - this.chewingSince > 6000) {
      this.chewingSince = now;
      const target: GazeTarget = this.rng() < 0.62 ? "plate" : "face";
      this.ev.onGazeHint?.(target, "관객이 씹고 있다 — 지켜본다");
    }
  }

  dispose() {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}

function labelKo(g: Gesture): string {
  return { frown: "찡그림", smile: "웃음", reach_hand: "손 뻗기", lean_in: "몸 기울이기", head_tilt: "고개 기울이기" }[g];
}
