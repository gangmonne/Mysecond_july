/**
 * SecondFace — 세컨 자신의 얼굴 상태 합성기. 메타휴먼처럼 살아 있게:
 *
 *   립싱크   — 말하는 만큼 입이 움직인다 (brain/lipsync 의 viseme 트랙)
 *   깜빡임   — 2.2~6초 간격 자동 (가끔 두 번 연속). 시드 가능(규약)
 *   지연재생 — 거울 이벤트: 관객 몸짓 순간의 표정 스니펫을 fidelity 만큼, 느리게
 *   미세움직임 — 완전한 정지는 죽음이다. 아주 작은 부유
 *
 * tick() 이 매 프레임 ExpressionFrame 을 뱉는다. 이것이 곧:
 *   - 웹 spatial 몸의 표정 입력
 *   - 브리지로 나가는 UE 동기화 피드 (관객의 원시 표정은 절대 밖으로 나가지 않는다)
 */
import type { ExpressionFrame } from "@contract/contract";
import type { FaceFrame } from "../capture/signals";
import { sampleVisemes, type Viseme } from "../brain/lipsync";

interface Replay { frames: FaceFrame[]; startedAt: number; rate: number; weight: number }

export class SecondFace {
  private track: Viseme[] | null = null;
  private trackStart = 0;
  private trackDur = 0;
  private trackChars = 1;

  private replay: Replay | null = null;

  private nextBlink: number;
  private blinkStart = -1;
  private doubleBlink = false;

  private cur = { jaw: 0, smile: 0, brow: 0, browUp: 0, blink: 0, yaw: 0, pitch: 0, roll: 0 };

  constructor(private rng: () => number = Math.random) {
    this.nextBlink = performance.now() + 1500 + this.rng() * 2500;
  }

  /* ── 립싱크 ── */
  speak(track: Viseme[], durMs: number, textLen: number) {
    this.track = track;
    this.trackDur = durMs;
    this.trackChars = Math.max(1, textLen);
    this.trackStart = performance.now();
  }
  /** TTS onboundary(charIndex)로 트랙 커서를 실제 발화 위치에 재동기화 */
  syncTo(charIndex: number) {
    if (!this.track) return;
    const frac = Math.min(1, charIndex / this.trackChars);
    this.trackStart = performance.now() - frac * this.trackDur;
  }
  stopSpeak() { this.track = null; }

  /* ── 지연 표정 재생 (거울) ── */
  replayExpression(frames: FaceFrame[], fidelity: number) {
    if (!frames.length) return;
    this.replay = {
      frames,
      startedAt: performance.now(),
      rate: 0.55 + 0.45 * fidelity, // 열화될수록 느린 복제
      weight: fidelity,
    };
  }

  /* ── 합성 ── */
  tick(now = performance.now()): ExpressionFrame {
    // 목표값 계산
    let tJaw = 0, tSmile = 0, tBrow = 0, tBrowUp = 0, tYaw = 0, tPitch = 0, tRoll = 0;

    // 1) 거울 재생 (관객이 그 몸짓을 하던 순간의 표정 — 뒤늦게, 약하게, 반전해서)
    if (this.replay) {
      const { frames, startedAt, rate, weight } = this.replay;
      const t0 = frames[0].t;
      const tNow = t0 + (now - startedAt) * rate;
      const last = frames[frames.length - 1];
      if (tNow >= last.t) {
        this.replay = null;
      } else {
        let i = 0;
        while (i < frames.length - 1 && frames[i + 1].t < tNow) i++;
        const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
        const k = b.t > a.t ? (tNow - a.t) / (b.t - a.t) : 0;
        const mix = (x: number, y: number) => (x + (y - x) * k) * weight;
        tJaw += mix(a.jaw, b.jaw);
        tSmile += mix(a.smile, b.smile);
        tBrow += mix(a.brow, b.brow);
        tBrowUp += mix(a.browUp, b.browUp);
        tYaw += -mix(a.yaw, b.yaw); // 거울이므로 좌우 반전
        tPitch += mix(a.pitch, b.pitch);
        tRoll += -mix(a.roll, b.roll);
      }
    }

    // 2) 립싱크 — 말하는 만큼 입이 열린다 (재생과 겹치면 입은 말이 우선)
    if (this.track) {
      const el = now - this.trackStart;
      if (el > this.trackDur + 400) {
        this.track = null;
      } else {
        const v = sampleVisemes(this.track, el);
        tJaw = Math.max(tJaw, v.jaw);
        tSmile = Math.max(tSmile, v.smile);
      }
    }

    // 3) 깜빡임 — 자동. 말하거나 표정을 재생 중이어도 눈은 깜빡인다
    let blink = 0;
    if (this.blinkStart >= 0) {
      const e = (now - this.blinkStart) / 150; // 150ms 벨커브 (연속 깜빡임 대기 중엔 e<0)
      blink = e < 0 || e >= 1 ? 0 : Math.sin(e * Math.PI);
      if (e >= 1) {
        if (this.doubleBlink) {
          this.doubleBlink = false;
          this.blinkStart = now + 90; // 곧바로 한 번 더
        } else {
          this.blinkStart = -1;
          this.nextBlink = now + 2200 + this.rng() * 3800;
        }
      }
    } else if (now >= this.nextBlink) {
      this.blinkStart = now;
      this.doubleBlink = this.rng() < 0.22;
    }

    // 4) 미세 부유 — 완전한 정지는 없다
    const t = now / 1000;
    tYaw += Math.sin(t * 0.31) * 0.015;
    tPitch += Math.sin(t * 0.47 + 1.3) * 0.01;
    tRoll += Math.sin(t * 0.23 + 2.1) * 0.008;

    // 수렴 (붙을 땐 빠르게, 떨어질 땐 느리게 — 여운)
    const step = (cur: number, tgt: number, up = 0.35, down = 0.12) =>
      cur + (tgt - cur) * (Math.abs(tgt) > Math.abs(cur) ? up : down);
    this.cur.jaw = step(this.cur.jaw, tJaw, 0.5, 0.3); // 입은 민첩하게
    this.cur.smile = step(this.cur.smile, tSmile);
    this.cur.brow = step(this.cur.brow, tBrow);
    this.cur.browUp = step(this.cur.browUp, tBrowUp);
    this.cur.yaw = step(this.cur.yaw, tYaw, 0.12, 0.06);
    this.cur.pitch = step(this.cur.pitch, tPitch, 0.12, 0.06);
    this.cur.roll = step(this.cur.roll, tRoll, 0.12, 0.06);
    this.cur.blink = blink; // 깜빡임은 보간 없이 즉각

    return { kind: "face", t: Date.now(), ...this.cur };
  }
}
