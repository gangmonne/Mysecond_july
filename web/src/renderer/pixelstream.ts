/**
 * PixelStreamRenderer — 전시 본선. UE5 메타휴먼을 Pixel Streaming 으로 페이지에 스트림.
 * 페이지 → UE 로 계약 JSON 을 emitUIInteraction 데이터 채널로 보낸다.
 * UE 쪽 수신은 BP_SecondDirector 가 담당 (기존 OSC 라우팅과 동일 어휘).
 *
 * Claude Code P5 작업:
 *  - @epicgames-ps/lib-pixelstreamingfrontend-ue5.5 설치, PixelStreaming 인스턴스 마운트
 *  - perform/mirror/gaze → emitUIInteraction({ ...envelope })
 *  - 연결 끊김 시 ClipBankRenderer 로 자동 폴백 (전시에서 스트림이 죽어도 세컨은 죽지 않는다)
 */
import type { Action, MirrorEvent, GazeTarget } from "@contract/contract";
import type { Renderer } from "./clipbank";

export class PixelStreamRenderer implements Renderer {
  constructor(_root: HTMLElement, _signallingUrl: string) { /* P5 */ }
  perform(_a: Action) { /* emitUIInteraction(a) */ }
  mirror(_m: MirrorEvent) { /* emitUIInteraction(m) */ }
  gaze(_g: GazeTarget) { /* emitUIInteraction({kind:'gaze', target:g}) */ }
  setSpeakingListener(_cb: (s: boolean) => void) { /* TTS 오디오 이벤트와 연동 */ }
}
