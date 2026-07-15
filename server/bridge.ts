/**
 * Bridge — WebSocket 허브. 페이지가 Envelope(Action|MirrorEvent)를 publish,
 * UE(또는 mock 수신기)가 subscribe. 기존 파이썬 mock_unreal 과 공존하려면
 * OSC 게이트웨이(ws→udp 7000)를 옵션으로 붙인다.
 *
 * Claude Code P5: ws 라이브러리로 20줄 허브 + /api/second Anthropic 프록시를 이 서버에 동거.
 */
export {};
