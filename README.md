# 세컨과의 식사 — LIVE

웹캠에 맺힌 관객의 몸짓을, 세컨이 대부분 무시하고 아주 가끔 아주 뒤늦게 불완전하게 따라 하는 세션.

- 시작점: `CLAUDE.md` (Claude Code 작업 지시서, Phase P0~P6)
- 단일 진실원: `contract/contract.ts`
- 이미 구현됨: `web/src/director/mirror.ts` (무시/지연/열화 게이팅), `web/src/capture/signals.ts` (MediaPipe 신호 추출), `web/src/renderer/clipbank.ts` (FMV 클립 뱅크 몸)
- 스텁(Claude Code 가 채움): persona / pixelstream / bridge

프라이버시: 웹캠 프레임은 저장·전송하지 않는다. 신호만 남긴다.
