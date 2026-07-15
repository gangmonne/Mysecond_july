/**
 * 디버그 오버레이 (P1) — 감지된 신호를 화면 구석에 소문자로 잠깐 띄운다.
 * 관객에게 보이는 요소가 아니라 리허설·튜닝용 낮은 목소리.
 */
import type { SignalEvent } from "@contract/contract";

export class SignalOverlay {
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "absolute", left: "14px", bottom: "14px", zIndex: "5",
      display: "flex", flexDirection: "column", gap: "2px", alignItems: "flex-start",
      pointerEvents: "none", fontFamily: "ui-monospace, monospace",
      fontSize: "11px", letterSpacing: "0.08em", color: "#8c8072",
      textTransform: "lowercase", textShadow: "0 1px 2px rgba(0,0,0,0.6)",
    });
    root.appendChild(this.el);
  }

  note(s: SignalEvent) {
    const row = document.createElement("span");
    row.textContent = `${s.signal} ·${s.strength.toFixed(2)}`;
    row.style.transition = "opacity 1.4s ease";
    this.el.appendChild(row);
    while (this.el.children.length > 5) this.el.firstChild?.remove();
    setTimeout(() => { row.style.opacity = "0"; }, 2400);
    setTimeout(() => row.remove(), 4000);
  }
}
