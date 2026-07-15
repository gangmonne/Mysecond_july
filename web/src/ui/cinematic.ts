/**
 * Cinematic — 스테이지를 필름처럼 만드는 레이어 컨트롤러.
 *
 * 미학은 CLAUDE.md 그대로다: 차갑고, 뒤늦고, 열화된. 화려함이 아니라 밀도.
 *   - 어둠 속의 현존(aura)  : 클립/메타휴먼이 없어도 화면이 비지 않게 숨쉬는 빛
 *   - 컬러 그레이드 + 비네트 : 그림자를 따뜻하게 눌러 톤을 잡는다
 *   - 필름 그레인(canvas)   : 미세한 입자. 완벽한 디지털을 거부한다
 *   - 레터박스              : 세션 시작에 천천히 닫힌다 (앉는다 = 영화가 시작된다)
 *   - 자막                  : 흐릿하게 떠올랐다 늦게 사라진다 (desync 는 몸이 표현)
 *
 * 그레인은 전시장 GPU 를 배려해 ~15fps 저해상도로만 그린다.
 */

import { FloatingCaption } from "./words";

type Mood = "idle" | "talk" | "gesture";

export class Cinematic {
  private grain: HTMLCanvasElement;
  private gctx: CanvasRenderingContext2D;
  private raf = 0;
  private lastGrain = 0;
  private buf: ImageData;
  private words: FloatingCaption;

  constructor(private stage: HTMLElement, caption: HTMLElement) {
    this.words = new FloatingCaption(caption);

    const aura = div("cine-aura");
    const grade = div("cine-grade");
    const vignette = div("cine-vignette");
    const barTop = div("cine-bar top");
    const barBottom = div("cine-bar bottom");

    this.grain = document.createElement("canvas");
    this.grain.className = "cine-grain";

    // aura 는 몸 뒤로, 나머지 필름 레이어는 몸 위로 (z-index 는 CSS 가 잡는다)
    stage.prepend(aura);
    stage.append(grade, vignette, this.grain, barTop, barBottom);

    const g = this.grain.getContext("2d", { alpha: true });
    if (!g) throw new Error("grain 2d context 불가");
    this.gctx = g;
    this.buf = this.gctx.createImageData(1, 1); // resize 에서 실제 크기로 재생성
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** 콜드 오픈 → 세션. 레터박스를 닫고 그레인을 돌린다 */
  enter() {
    this.stage.dataset.cine = "on";
    this.loop();
  }

  /** idle/talk/gesture 에 따라 오라의 호흡 속도가 바뀐다 */
  setMood(mood: Mood) {
    this.stage.dataset.mood = mood;
  }

  /** 말: 허공에 떠올랐다 한 단어씩 증발한다 (휘발되는 언어) */
  say(text: string, holdMs: number) {
    this.words.say(text, holdMs);
  }

  clear() {
    this.words.clear();
  }

  private resize() {
    // 실제 픽셀의 1/6 해상도로만 그린다 — 입자가 굵어야 필름 같다
    const w = Math.max(2, Math.round(this.stage.clientWidth / 6));
    const h = Math.max(2, Math.round(this.stage.clientHeight / 6));
    this.grain.width = w;
    this.grain.height = h;
    this.buf = this.gctx.createImageData(w, h);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastGrain < 66) return; // ~15fps
    this.lastGrain = now;
    this.drawGrain();
  };

  private drawGrain() {
    const d = this.buf.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    this.gctx.putImageData(this.buf, 0, 0);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.words.clear(true);
  }
}

function div(className: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  return el;
}
