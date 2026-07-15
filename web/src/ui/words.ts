/**
 * FloatingCaption — 세컨의 말은 자막으로 고정되지 않는다. 허공에 떠올랐다,
 * 한 단어씩 위로 흩어지며 흐려지고, 사라진다. 휘발되는 언어.
 *
 * 흐름: 각 단어가 흐릿하게 맺힌다(읽을 수 있게 잠깐 머문다) → 미세하게 부유한다 →
 *       holdMs 뒤 한 단어씩 위로 떠오르며 blur·fade 로 증발한다.
 * 자막은 desync 되지 않는다 — 몸(renderer)이 desync_ms 만큼 늦는다. 말은 먼저, 몸은 늦게.
 *
 * 모든 애니메이션은 Web Animations API. reflow 를 피하려 토큰은 절대배치된다.
 */

interface Tok {
  el: HTMLElement;
  bob?: Animation;
  drift?: Animation;
  releaseAt?: number;
}

export class FloatingCaption {
  private toks: Tok[] = [];
  private timers: number[] = [];

  constructor(private root: HTMLElement) {
    this.root.style.position = "absolute";
  }

  /** 한 문장을 허공에 흩뿌린다. holdMs 만큼 읽히다 증발을 시작한다 */
  say(text: string, holdMs: number) {
    this.clear(true); // 이전 문장은 서둘러 증발시킨다

    const words = text.split(/\s+/).filter((w) => w.length);
    if (!words.length) return;

    // 1) 자연 흐름으로 한 줄을 배치해 각 단어의 좌표를 잰다
    const line = document.createElement("div");
    Object.assign(line.style, {
      position: "absolute", left: "0", right: "0", bottom: "18vh",
      textAlign: "center", pointerEvents: "none", visibility: "hidden",
    });
    const spans = words.map((w) => {
      const s = document.createElement("span");
      s.className = "float-word";
      s.textContent = w;
      Object.assign(s.style, { display: "inline-block", margin: "0 0.2em", whiteSpace: "nowrap" });
      line.appendChild(s);
      return s;
    });
    this.root.appendChild(line);

    // 2) 잰 좌표로 고정(절대배치) — 이제 각 단어는 독립적으로 떠다닐 수 있다
    const base = this.root.getBoundingClientRect();
    const placed = spans.map((s) => {
      const r = s.getBoundingClientRect();
      return { s, left: r.left - base.left, top: r.top - base.top, w: r.width };
    });
    line.remove();

    placed.forEach(({ s, left, top, w }, i) => {
      Object.assign(s.style, {
        position: "absolute", left: `${left}px`, top: `${top}px`, width: `${w}px`,
        margin: "0", textAlign: "center", visibility: "visible",
        willChange: "transform, opacity, filter",
      });
      this.root.appendChild(s);
      const tok: Tok = { el: s };
      this.toks.push(tok);

      // 맺힘 — 흐릿하게 떠오른다
      s.animate(
        [
          { opacity: 0, filter: "blur(10px)", transform: "translateY(12px)" },
          { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
        ],
        { duration: 760, delay: i * 55, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" },
      );

      // 부유 — 머무는 동안에도 결코 정지하지 않는다
      const bobAmp = 2 + Math.random() * 3;
      const startBob = this.after(760 + i * 55, () => {
        tok.bob = s.animate(
          [{ transform: "translateY(0)" }, { transform: `translateY(${-bobAmp}px)` }],
          { duration: 2200 + Math.random() * 1400, direction: "alternate", iterations: Infinity, easing: "ease-in-out" },
        );
      });
      this.timers.push(startBob);

      // 증발 — holdMs 뒤 한 단어씩 위로 흩어진다
      const releaseTimer = this.after(holdMs + i * 90, () => this.evaporate(tok));
      this.timers.push(releaseTimer);
    });
  }

  /** 한 토큰을 증발시킨다: 위로 떠오르며 흩어지고 흐려진다 */
  private evaporate(tok: Tok, fast = false) {
    tok.bob?.cancel();
    const dx = (Math.random() - 0.5) * 240;
    const dy = -(120 + Math.random() * 200);
    const rot = (Math.random() - 0.5) * 26;
    const dur = fast ? 900 + Math.random() * 500 : 3400 + Math.random() * 2200;
    tok.drift = tok.el.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1, filter: "blur(0px)" },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.5}px) rotate(${rot * 0.5}deg)`, opacity: 0.55, filter: "blur(3px)", offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0, filter: "blur(16px)" },
      ],
      { duration: dur, easing: "cubic-bezier(.33,0,.5,1)", fill: "forwards" },
    );
    tok.drift.onfinish = () => tok.el.remove();
    this.toks = this.toks.filter((t) => t !== tok);
  }

  /** 모든 토큰을 즉시 증발로 보낸다 (세션 종료·새 문장 시작 시) */
  clear(fast = false) {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
    for (const tok of [...this.toks]) this.evaporate(tok, fast);
  }

  private after(ms: number, fn: () => void): number {
    return window.setTimeout(fn, ms);
  }
}
