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
- 세션 종료 설문(5축)은 `server/sessions/*.json` 으로, 브리지가 없으면 localStorage 로 남는다.

## 실행 & 모니터링

빠른 실행/모니터링 안내는 **[RUN.md](./RUN.md)** 를 본다 (설치·자산 받기·"file not found" 해결 포함).

오디언스 화면은 순수하게 시네마틱하게 유지된다. 운영자는 **감독 모니터**를 3가지 방법으로 연다:
**`[m]` 키** · 주소에 **`?monitor=1`** · **좌상단 구석 클릭**(관객은 눈치 못 챈다).

모니터에 실시간 표시: 경과/남은 시간 · 거울 발화 수(상한 8 대비) · 준비 중인 몸짓과 카운트다운 ·
전역 쿨다운 · 채널 상태(cam / bridge / stream / stt) · 방금 읽은 신호 · 하단에 '행동 봉투'
결정 로그("찡그림: 무시 — 봤다. 못 본 척했다").

- `[t]` **이음새 조정** — 무시 확률 / 지연 배율 / 열화 범위 / 쿨다운 / 세션 상한 라이브 튜닝.
- 리허설 훅(dev): 콘솔에 `__second.say("맛있어?")` · `__second.signal("reach_hand")` ·
  `__second.monitor()` — 마이크·웹캠 없이 대사와 몸짓을 흘려 넣어본다.
- 브리지가 켜져 있으면 `sessions/*.json` 이 쌓인다 — 세션별 설문 결과가 곧 진행 기록이다.

## 시네마틱

몸(메타휴먼/클립)이 아직 없어도 화면은 필름처럼 보인다: 어둠 속에서 숨쉬는 현존(aura),
레터박스, 필름 그레인, 비네트, 따뜻한 컬러 그레이드.
열화(fidelity)가 낮은 거울일수록 몸이 더 흔들리고 채도가 빠진다 — 완벽한 복제는 이 작품에서 버그다.

세컨의 말은 자막으로 고정되지 않는다 — 허공에 흐릿하게 맺혔다, 한 단어씩 위로 흩어지며
증발한다 (**휘발되는 언어**, `ui/words.ts`). 읽히는 순간과 사라지는 순간이 겹친다.

### 몸(body) — 세 가지

- **spatial (기본)** `renderer/spatial.ts` — 3D 형상. `manifest.mesh`(Higgsfield image_to_3d 스캔
  GLB)가 있으면 그 머리를, 없으면 **코드로 만든 점군 두상**을 어둠 속에 세운다. 외부 파일이
  전혀 없어도 뜨므로 "file not found" 로 화면이 비지 않는다. gaze 는 목의 회전, 발화는 얼굴
  진동, fidelity 열화는 형상의 흔들림·탈색으로 표현된다. **나중에 웹캠 blendshape → 표정
  실시간 연동**을 얹기에 평면 영상보다 자연스럽다.
- **clip** `renderer/clipbank.ts` — FMV. `manifest.poster`(초상)가 얼굴로 깔리고 상태별 클립이
  그 위에서 크로스페이드. `?body=clip`.
- **pixelstream** `renderer/pixelstream.ts` — UE5 메타휴먼(전시 본선). `?stream=`. 끊기면 폴백.

플레이스홀더 자산은 Higgsfield 로 만든 동양인 여성·안경 초상 → idle 루프 → 3D 메시.
`npm run assets:fetch` 로 로컬 고정한다. 전시에선 UE 스캔/메타휴먼으로 교체.

> hi-fi 본선은 여전히 UE Pixel Streaming 이다 (CLAUDE.md). three.js spatial 은 리허설/웹 배포용 몸.

- 전시 준비: `web/public/models/README.md` (MediaPipe 모델 로컬 배치), `web/public/clips/README.md` (클립 규약), `unreal/PIXELSTREAM.md` (UE 셋업)

프라이버시: 웹캠 프레임·음성은 저장·전송하지 않는다. 신호와 텍스트만 남긴다.
