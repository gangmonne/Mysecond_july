/**
 * 세컨 행동 계약 (single source of truth) — contract.py 의 TS 이식 + 거울 어휘 확장.
 * 어휘를 바꾸면 여기서만 바꾼다. persona / director / renderer / bridge 모두 이 파일을 소비한다.
 */

export const GAZE_TARGETS = ["face", "plate", "away"] as const;
export const GAZE_CURVES = ["eyes_lead_head", "snap", "drift"] as const;
export const EMOTIONS = ["neutral", "amused_dry", "warm", "cold", "sulking", "tired"] as const;

/** 관객에게서 감지하는 신호 (capture 가 방출) */
export const SIGNALS = [
  "frown",      // 찡그림
  "smile",      // 웃음
  "surprised",  // 놀람 (눈썹 위로 + 입 벌어짐)
  "pout",       // 시무룩 (입꼬리 내려감)
  "nod",        // 끄덕임
  "shake",      // 도리질 (고개 가로젓기)
  "reach_hand", // 손을 뻗음 (화면/세컨 쪽으로)
  "lean_in",    // 몸을 기울여 다가옴
  "head_tilt",  // 고개 기울임
  "chewing",    // 씹는 중 (거울 대상이 아니라 주시 대상)
  "gone",       // 자리 비움
] as const;

/** 세컨이 실제로 따라 할 수 있는 몸짓 (renderer 가 소비) */
export const GESTURES = [
  "frown", "smile", "surprised", "pout", "nod", "shake",
  "reach_hand", "lean_in", "head_tilt",
] as const;

export type GazeTarget = (typeof GAZE_TARGETS)[number];
export type GazeCurve = (typeof GAZE_CURVES)[number];
export type Emotion = (typeof EMOTIONS)[number];
export type Signal = (typeof SIGNALS)[number];
export type Gesture = (typeof GESTURES)[number];

export interface Glitch {
  expr_freeze: number; // 0..1
  desync_ms: number;   // 0..600
  texture_break: number; // 0..1
}

/** 대화 채널 — 뇌(Claude)가 뱉는 한 턴 */
export interface Action {
  kind: "action";
  say: string;
  emotion: Emotion;
  gaze: GazeTarget;
  gaze_curve: GazeCurve;
  eat_mimic: boolean;
  glitch: Glitch;
}

/** 자율신경 채널 — 뇌를 거치지 않는 거울 반응 */
export interface MirrorEvent {
  kind: "mirror";
  gesture: Gesture;
  /** 원 신호가 감지된 시각 (epoch ms) — 얼마나 늦었는지가 곧 내용이다 */
  source_t: number;
  /** 감지로부터의 지연 (ms). 렌더러는 이 값을 자막 없이 몸으로만 발화한다 */
  delay_ms: number;
  /** 0..1 — 얼마나 열화된 복제인가. 1이어도 완벽하지 않게 렌더한다 */
  fidelity: number;
}

/** 관객 신호 — capture → director */
export interface SignalEvent {
  signal: Signal;
  t: number;        // epoch ms
  strength: number; // 0..1
}

export type Envelope = Action | MirrorEvent;

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function validateAction(d: Partial<Action> & { glitch?: Partial<Glitch> }): Action {
  const g: Partial<Glitch> = d.glitch ?? {};
  return {
    kind: "action",
    say: typeof d.say === "string" ? d.say : "",
    emotion: (EMOTIONS as readonly string[]).includes(d.emotion as string) ? (d.emotion as Emotion) : "neutral",
    gaze: (GAZE_TARGETS as readonly string[]).includes(d.gaze as string) ? (d.gaze as GazeTarget) : "face",
    gaze_curve: (GAZE_CURVES as readonly string[]).includes(d.gaze_curve as string)
      ? (d.gaze_curve as GazeCurve)
      : "eyes_lead_head",
    eat_mimic: !!d.eat_mimic,
    glitch: {
      expr_freeze: clamp(g.expr_freeze ?? 0),
      desync_ms: Math.round(clamp(g.desync_ms ?? 0, 0, 600)),
      texture_break: clamp(g.texture_break ?? 0),
    },
  };
}

/** LLM 에 강제할 스키마 설명 (persona 시스템 프롬프트에 삽입) */
export const ACTION_JSON_SCHEMA = JSON.stringify(
  {
    say: "string (한국어 대사, 1~3문장, 건조하고 짧게)",
    emotion: `one of ${JSON.stringify(EMOTIONS)}`,
    gaze: `one of ${JSON.stringify(GAZE_TARGETS)}`,
    gaze_curve: `one of ${JSON.stringify(GAZE_CURVES)}`,
    eat_mimic: "boolean",
    glitch: { expr_freeze: "0..1", desync_ms: "0..600", texture_break: "0..1" },
  },
  null,
  2,
);

/** OSC 평탄화 — 기존 BP_SecondDirector 인자 순서와 호환 */
export function actionToOsc(a: Action): [string, (string | number)[]] {
  return [
    "/second/action",
    [a.say, a.emotion, a.gaze, a.gaze_curve, a.eat_mimic ? 1 : 0,
     a.glitch.expr_freeze, a.glitch.desync_ms, a.glitch.texture_break],
  ];
}

export function mirrorToOsc(m: MirrorEvent): [string, (string | number)[]] {
  return ["/second/mirror", [m.gesture, m.delay_ms, m.fidelity]];
}
