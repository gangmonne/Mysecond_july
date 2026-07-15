/**
 * SessionMonitor — 운영자(감독) 모니터. [m] 로 토글. 오디언스 화면엔 절대 안 보인다.
 *
 * "지금 얼마나 진행됐는지"를 한눈에 본다:
 *   세션    — 경과 / 남은 시간, seed
 *   거울    — 세션 상한 대비 발화 수 (●=한 번 따라 함, ·=아직 남은 몫), 마지막 실행 이후 경과
 *   예약    — 몸속에서 준비 중인 몸짓과 남은 카운트다운·열화
 *   쿨다운  — 다음 거울까지의 전역 쿨다운
 *   채널    — 카메라 / 브리지 / 픽셀스트림 / STT 연결 상태
 *   신호    — 방금 관객에게서 읽은 신호들
 *
 * 열려 있는 동안만 250ms 로 스스로 갱신한다 (닫히면 아무 비용도 없다).
 */
import type { DirectorSnapshot } from "../director/mirror";
import type { SignalEvent } from "@contract/contract";

export type StreamState = "off" | "up" | "down";

interface Channels {
  camera: boolean;
  bridge: boolean;
  stream: StreamState;
  stt: string;
}

interface SessionInfo {
  seed: number;
  startedAt: number;
  endAt: number;
}

export class SessionMonitor {
  private el: HTMLElement;
  private open = false;
  private tick = 0;
  private channels: Channels = { camera: false, bridge: false, stream: "off", stt: "—" };
  private session: SessionInfo = { seed: 0, startedAt: 0, endAt: 0 };
  private speaking = false;
  private lastSay = "";
  private signals: SignalEvent[] = [];

  constructor(stage: HTMLElement, private getSnapshot: () => DirectorSnapshot) {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "absolute", left: "0", top: "0", zIndex: "13", width: "300px",
      padding: "14px 16px", display: "none",
      background: "rgba(6,5,4,0.86)", borderRight: "1px solid #2a251f", borderBottom: "1px solid #2a251f",
      backdropFilter: "blur(3px)", fontFamily: "ui-monospace, monospace",
      fontSize: "11px", lineHeight: "1.55", color: "#b7ad9d", whiteSpace: "pre-wrap",
    });
    stage.appendChild(this.el);
  }

  toggle() {
    this.open = !this.open;
    this.el.style.display = this.open ? "block" : "none";
    document.body.classList.toggle("monitor", this.open);
    if (this.open) {
      this.render();
      this.tick = window.setInterval(() => this.render(), 250);
    } else {
      clearInterval(this.tick);
    }
  }

  /* ── main.ts 가 먹여주는 상태 ── */
  startSession(seed: number, startedAt: number, endAt: number) {
    this.session = { seed, startedAt, endAt };
  }
  setCamera(on: boolean) { this.channels.camera = on; }
  setBridge(on: boolean) { this.channels.bridge = on; }
  setStream(s: StreamState) { this.channels.stream = s; }
  setStt(s: string) { this.channels.stt = s; }
  setSpeaking(on: boolean, say = "") {
    this.speaking = on;
    if (say) this.lastSay = say;
  }
  signal(s: SignalEvent) {
    this.signals.unshift(s);
    if (this.signals.length > 6) this.signals.pop();
  }

  /** 원격 모니터(브리지 /monitor 페이지)로 보낼 상태 묶음 */
  publicState() {
    return {
      kind: "monitor" as const,
      t: Date.now(),
      session: this.session,
      channels: this.channels,
      speaking: this.speaking,
      lastSay: this.lastSay,
      signals: this.signals.slice(0, 4),
      director: this.getSnapshot(),
    };
  }

  private render() {
    const now = Date.now();
    const snap = this.getSnapshot();
    const L: string[] = [];

    L.push(`감독 모니터                    [m] 닫기`);
    L.push(sep());

    // 세션
    const elapsed = this.session.startedAt ? now - this.session.startedAt : 0;
    const remain = this.session.endAt ? Math.max(0, this.session.endAt - now) : 0;
    L.push(`세션  ${mmss(elapsed)} 경과 · ${mmss(remain)} 남음   seed ${this.session.seed}`);

    // 거울 — 상한 대비
    const pips = "●".repeat(snap.fired) + "·".repeat(Math.max(0, snap.cap - snap.fired));
    L.push(`거울  ${pips}  ${snap.fired}/${snap.cap}`);

    // 쿨다운
    if (snap.globalCooldownLeftMs > 0) {
      L.push(`쿨다운  ${bar(snap.globalCooldownLeftMs, 22000)}  ${(snap.globalCooldownLeftMs / 1000).toFixed(0)}s`);
    } else if (snap.fired >= snap.cap) {
      L.push(`쿨다운  상한 도달 — 이제 그냥 바라본다`);
    } else {
      L.push(`쿨다운  열려 있음 (다음 거울 가능)`);
    }

    // 예약
    if (snap.pending.length) {
      for (const p of snap.pending) {
        L.push(`  ▸ ${labelKo(p.gesture)}  ${(p.inMs / 1000).toFixed(1)}s 뒤 · ${Math.round(p.fidelity * 100)}%`);
      }
    } else {
      L.push(`  예약 없음`);
    }

    L.push(sep());

    // 발화 / 시선
    L.push(`발화  ${this.speaking ? "● 말하는 중" : "○ 침묵"}   시선 ${this.session.startedAt ? snap.gaze : "—"}`);
    if (this.lastSay) L.push(`  “${trunc(this.lastSay, 30)}”`);

    // 채널
    L.push(sep());
    L.push(`채널  cam ${dot(this.channels.camera)}  bridge ${dot(this.channels.bridge)}  stream ${streamDot(this.channels.stream)}`);
    L.push(`      stt ${this.channels.stt}`);

    // 신호
    L.push(sep());
    L.push(`신호  ${this.signals.length ? "" : "(아직 없음)"}`);
    for (const s of this.signals) {
      L.push(`  ${new Date(s.t).toLocaleTimeString("ko-KR", { hour12: false })}  ${s.signal.padEnd(11)} ·${s.strength.toFixed(2)}`);
    }

    this.el.textContent = L.join("\n");
  }
}

function sep() { return "─".repeat(34); }
function mmss(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function bar(v: number, max: number, width = 18) {
  const n = Math.round((Math.min(v, max) / max) * width);
  return "█".repeat(n) + "░".repeat(width - n);
}
function dot(on: boolean) { return on ? "●" : "○"; }
function streamDot(s: StreamState) { return s === "up" ? "●" : s === "down" ? "✕" : "○"; }
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }
function labelKo(g: string): string {
  return ({ frown: "찡그림", smile: "웃음", reach_hand: "손 뻗기", lean_in: "몸 기울이기", head_tilt: "고개 기울이기" } as Record<string, string>)[g] ?? g;
}
