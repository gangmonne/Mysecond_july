/**
 * PixelStreamRenderer — 전시 본선. UE5 메타휴먼을 Pixel Streaming 으로 페이지에 스트림.
 * 페이지 → UE 로 계약 JSON 을 emitUIInteraction 데이터 채널로 보낸다.
 * UE 쪽 수신은 BP_SecondDirector 가 담당 (기존 OSC 라우팅과 동일 어휘).
 *
 * 연결이 죽으면 onDown 콜백 — 앱 셸이 ClipBankRenderer 로 폴백한다.
 * (전시에서 스트림이 죽어도 세컨은 죽지 않는다.)
 */
import { Config, PixelStreaming } from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.5";
import type { Action, MirrorEvent, GazeTarget } from "@contract/contract";
import type { Renderer } from "./clipbank";

export class PixelStreamRenderer implements Renderer {
  private stream: PixelStreaming;
  private speakingCb: (s: boolean) => void = () => {};
  private up = false;

  constructor(root: HTMLElement, signallingUrl: string, private onDown?: () => void) {
    const config = new Config({
      initialSettings: {
        ss: signallingUrl,
        AutoConnect: true,
        AutoPlayVideo: true,
        StartVideoMuted: false,
        HoveringMouse: true,
        WaitForStreamer: true,
      },
    });
    this.stream = new PixelStreaming(config, { videoElementParent: root });
    this.stream.addEventListener("playStream", () => { this.up = true; });
    this.stream.addEventListener("webRtcDisconnected", () => {
      if (!this.up) return;
      this.up = false;
      this.onDown?.();
    });
  }

  get connected() { return this.up; }

  private emit(payload: Record<string, unknown>) {
    this.stream.emitUIInteraction(payload);
  }

  perform(a: Action) {
    this.emit({ ...a });
    // 발화 타이밍: TTS 도입 전까지 클립뱅크와 같은 근사식으로 speaking 상태를 흉내낸다
    const ms = Math.max(1400, a.say.length * 145);
    this.speakingCb(true);
    setTimeout(() => this.speakingCb(false), a.glitch.desync_ms + ms);
  }

  mirror(m: MirrorEvent) {
    this.emit({ ...m });
  }

  gaze(g: GazeTarget) {
    this.emit({ kind: "gaze", target: g });
  }

  setSpeakingListener(cb: (s: boolean) => void) {
    this.speakingCb = cb;
  }

  dispose() {
    this.stream.disconnect();
  }
}
