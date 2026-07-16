/**
 * '이음새 조정' 패널 (P2) — MirrorDirector 의 config 를 라이브 튜닝한다.
 * 기존 웹 프로토타입의 이음새 조정 탭과 같은 문법: 키 [t] 로 열고 닫는다.
 *
 * 슬라이더: 몸짓별 무시 확률 / 지연 배율 / 열화(fidelity) 범위 / 쿨다운 / 세션 상한.
 * 지연은 몸짓별 [min,max] 를 개별로 노출하는 대신 기본값에 배율을 곱한다 —
 * 리허설에서 실제로 만지는 축은 "전체적으로 더 늦게/빨리" 하나였다.
 */
import { GESTURES, type Gesture } from "@contract/contract";
import { DEFAULT_MIRROR_CONFIG, type MirrorConfig } from "../director/mirror";

const GESTURE_KO: Record<Gesture, string> = {
  frown: "찡그림", smile: "웃음", surprised: "놀람", pout: "시무룩",
  nod: "끄덕임", shake: "도리질",
  reach_hand: "손 뻗기", lean_in: "몸 기울이기", head_tilt: "고개 기울이기",
};

export class TuningPanel {
  private el: HTMLElement;
  private ignoreProb: Record<Gesture, number>;
  private delayScale = 1;
  private fidelityLo = DEFAULT_MIRROR_CONFIG.fidelityRange[0];
  private fidelityHi = DEFAULT_MIRROR_CONFIG.fidelityRange[1];
  private globalCooldownS = DEFAULT_MIRROR_CONFIG.globalCooldownMs / 1000;
  private perGestureCooldownS = DEFAULT_MIRROR_CONFIG.perGestureCooldownMs / 1000;
  private sessionCap = DEFAULT_MIRROR_CONFIG.sessionCap;

  constructor(root: HTMLElement, private apply: (cfg: MirrorConfig) => void) {
    this.ignoreProb = { ...DEFAULT_MIRROR_CONFIG.ignoreProb };
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "absolute", right: "0", top: "0", bottom: "0", width: "280px",
      zIndex: "20", overflowY: "auto", padding: "16px 18px",
      background: "rgba(10,9,8,0.94)", borderLeft: "1px solid #2a251f",
      fontFamily: "ui-monospace, monospace", fontSize: "11px", lineHeight: "1.5",
      color: "#8c8072", display: "none",
    });
    root.appendChild(this.el);
    this.build();
  }

  toggle() {
    this.el.style.display = this.el.style.display === "none" ? "block" : "none";
  }

  isOpen() {
    return this.el.style.display !== "none";
  }

  private build() {
    this.section("이음새 조정 [t]");

    this.section("무시 확률 — 흔할수록 높게");
    for (const g of GESTURES) {
      this.slider(`${GESTURE_KO[g]}`, 0, 1, 0.01, this.ignoreProb[g], (v) => {
        this.ignoreProb[g] = v;
      });
    }

    this.section("지연 — 늦음 자체가 대사다");
    this.slider("지연 배율", 0.2, 2.5, 0.05, this.delayScale, (v) => { this.delayScale = v; });

    this.section("열화 — 완벽한 미러링은 버그다");
    this.slider("fidelity 최소", 0, 1, 0.01, this.fidelityLo, (v) => { this.fidelityLo = v; });
    this.slider("fidelity 최대", 0, 1, 0.01, this.fidelityHi, (v) => { this.fidelityHi = v; });

    this.section("희소성 — 드물어야 귀하다");
    this.slider("전역 쿨다운 (s)", 0, 90, 1, this.globalCooldownS, (v) => { this.globalCooldownS = v; });
    this.slider("몸짓별 쿨다운 (s)", 0, 180, 1, this.perGestureCooldownS, (v) => { this.perGestureCooldownS = v; });
    this.slider("세션 상한 (회)", 0, 20, 1, this.sessionCap, (v) => { this.sessionCap = v; });
  }

  private section(title: string) {
    const h = document.createElement("div");
    h.textContent = title;
    Object.assign(h.style, { color: "#d8d2c8", margin: "14px 0 6px", letterSpacing: "0.08em" });
    this.el.appendChild(h);
  }

  private slider(label: string, min: number, max: number, step: number, value: number, set: (v: number) => void) {
    const row = document.createElement("label");
    Object.assign(row.style, { display: "block", margin: "6px 0" });
    const cap = document.createElement("div");
    const val = document.createElement("span");
    val.textContent = ` ${value}`;
    val.style.color = "#d8d2c8";
    cap.textContent = label;
    cap.appendChild(val);
    const input = document.createElement("input");
    Object.assign(input, { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) });
    input.style.width = "100%";
    input.oninput = () => {
      const v = Number(input.value);
      val.textContent = ` ${v}`;
      set(v);
      this.apply(this.compose());
    };
    row.appendChild(cap);
    row.appendChild(input);
    this.el.appendChild(row);
  }

  private compose(): MirrorConfig {
    const delayRange = {} as MirrorConfig["delayRange"];
    for (const g of GESTURES) {
      const [lo, hi] = DEFAULT_MIRROR_CONFIG.delayRange[g];
      delayRange[g] = [Math.round(lo * this.delayScale), Math.round(hi * this.delayScale)];
    }
    const fLo = Math.min(this.fidelityLo, this.fidelityHi);
    const fHi = Math.max(this.fidelityLo, this.fidelityHi);
    return {
      ignoreProb: { ...this.ignoreProb },
      delayRange,
      fidelityRange: [fLo, fHi],
      globalCooldownMs: Math.round(this.globalCooldownS * 1000),
      perGestureCooldownMs: Math.round(this.perGestureCooldownS * 1000),
      sessionCap: this.sessionCap,
    };
  }
}
