# 세컨과의 식사 — LIVE

웹캠에 맺힌 관객의 몸짓을, 세컨이 대부분 무시하고 아주 가끔 아주 뒤늦게 불완전하게 따라 하는 세션.

- 시작점: `CLAUDE.md` (Claude Code 작업 지시서, Phase P0~P6 — 전부 구현됨)
- 단일 진실원: `contract/contract.ts` (`@contract` 별칭으로 web/server 가 공유)
- 두 채널: 자율신경(capture → director → renderer, 뇌를 거치지 않는다) / 대화(STT → persona(Claude) → renderer)
- 두 몸: `renderer/pixelstream.ts` (UE5 Pixel Streaming, 전시 본선) / `renderer/clipbank.ts` (FMV 클립 뱅크, 웹 배포·리허설)

## 실행

```sh
# 브리지 (WebSocket 허브 + Claude 프록시 + 설문 저장) — :8787
cd server && npm install
ANTHROPIC_API_KEY=sk-... npm start   # 키 없으면 페이지가 규칙 기반 mock 으로 폴백

# 페이지 — :5173 (브리지 없이도 동작)
cd web && npm install
npm run dev
```

- URL 파라미터: `?seed=` 난수 시드(리허설 재현) · `?min=` 세션 길이(분, 기본 13) · `?stream=ws://host:8888` UE 시그널링(없으면 클립뱅크)
- 키 `[t]`: 이음새 조정 패널 (무시 확률 / 지연 배율 / 열화 범위 / 쿨다운 / 세션 상한)
- 전시 준비: `web/public/models/README.md` (MediaPipe 모델 로컬 배치), `web/public/clips/README.md` (클립 규약), `unreal/PIXELSTREAM.md` (UE 셋업)
- 세션 종료 설문(5축)은 `server/sessions/*.json` 으로, 브리지가 없으면 localStorage 로 남는다.

프라이버시: 웹캠 프레임·음성은 저장·전송하지 않는다. 신호와 텍스트만 남긴다.
