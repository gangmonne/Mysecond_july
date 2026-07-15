# 세컨과의 식사 — LIVE 세션 (Claude Code 작업 지시서)

관객이 다과상 앞에 앉아 식사하는 동안, 웹캠에 맺힌 관객의 몸짓을
세컨(미믹)이 **대부분 무시하고, 아주 가끔, 아주 뒤늦게, 불완전하게** 따라 하는 세션.

> 찡그리면 → (85%는 무시) → 12초 뒤에 흐릿하게 찡그린다.
> 손을 뻗으면 → (그건 좀 드문 일이니까) → 4초 뒤에 손을 뻗어본다. 닿을 몸은 없지만.

이 "무시/지연/열화"가 이 프로젝트의 미학적 본체다. 정확한 미러링은 실패다.

---

## 아키텍처 (두 채널)

```
웹캠 ──► capture/signals.ts ──► director/mirror.ts ──┐   (자율신경 채널: 뇌를 거치지 않는다)
        (MediaPipe: 표정/포즈)   (무시·지연·열화 게이팅)  │
                                                      ▼
관객 발화(STT/텍스트) ──► brain/persona.ts(Claude) ──► contract(Action/MirrorEvent)
                          (대화 채널)                   │
                                                      ▼
                                       renderer/ (동일 계약을 소비하는 두 몸)
                                        ├─ pixelstream.ts : UE5 메타휴먼 Pixel Streaming (전시 본선)
                                        └─ clipbank.ts    : 사전 렌더 비디오 클립 뱅크 (웹 배포/리허설)
```

- **contract/contract.ts 가 단일 진실원.** 기존 파이썬 데모의 contract.py 와 어휘를 맞춘다.
  어휘를 바꿀 땐 이 파일만 바꾼다.
- 거울 반응(MirrorEvent)은 뇌(Claude)를 거치지 않고 렌더러로 직행한다.
  단, 최근 거울 이벤트 요약을 뇌의 시스템 프롬프트에 흘려 넣어
  세컨이 가끔 "아까 너 찡그렸잖아. 나도 해봤어. 늦었지만." 같은 말을 할 수 있게 한다.

## 고화질 미믹 렌더링 — three.js 를 쓰지 않는 이유와 대안

작가 본인을 고해상도 스캔 → 메타휴먼으로 옮기는 것이 전제이므로,
브라우저 자체 렌더(three.js)로는 화질 목표를 못 맞춘다. 두 트랙:

1. **UE5 Pixel Streaming (본선)** — GPU PC에서 메타휴먼을 렌더하고 WebRTC 로 페이지에 스트림.
   페이지는 인터페이스(웹캠 캡처 + 자막 + 입력)만 담당. 계약 JSON 은
   Pixel Streaming 의 `emitUIInteraction` 데이터 채널 또는 server/bridge.ts(WebSocket)로 전달.
   → unreal/PIXELSTREAM.md 참고.
2. **클립 뱅크 (웹 배포/리허설)** — 메타휴먼을 UE 시퀀서에서 상태별 고화질 클립으로 사전 렌더
   (idle 루프 ×3, talking 루프, frown, reach_hand, eat_mimic, gaze_plate/face/away 전환…)
   → 브라우저에서 이중 <video> 크로스페이드로 상태 머신 재생. FMV 방식.
   화질은 그대로, 실시간성만 양자화된다. 열화(fidelity)는 재생속도/불투명도/글리치 셰이더로 표현.

## 작업 순서 (Phase)

- [x] **P0 셋업**: `web/` 를 Vite + TypeScript 로 초기화. `@mediapipe/tasks-vision` 설치.
      contract.ts 를 web/src 와 server 가 공유하도록 tsconfig paths 설정.
- [ ] **P1 캡처**: capture/signals.ts 완성 — FaceLandmarker(blendshapes) + PoseLandmarker 를
      ~15fps 로 돌리고 SignalEvent 를 방출. 디버그 오버레이(감지된 신호를 화면 구석에 소문자로).
- [ ] **P2 디렉터**: director/mirror.ts 는 이미 구현돼 있다(핵심 로직 완성). 튜닝 UI(config 슬라이더:
      ignoreProb / delay 범위 / fidelity 범위 / cooldown)를 붙여라. 기존 웹 프로토타입의
      '이음새 조정' 탭과 같은 문법.
- [ ] **P3 클립 뱅크 렌더러**: renderer/clipbank.ts 완성 — 이중 video 레이어 크로스페이드,
      상태 머신(idle→gesture→idle), fidelity 열화(playbackRate 0.9~1.0, opacity, CSS 글리치),
      클립이 아직 없으므로 자리표시 클립은 단색+텍스트로 생성해 두고 경로만 규약화
      (`/clips/{state}.webm`).
- [ ] **P4 두뇌 연결**: brain/persona.ts — 기존 second-dinner/bridge/persona.py 의 시스템 프롬프트를
      이식. Anthropic SDK(서버 경유) 또는 로컬 프록시. 최근 MirrorEvent 3건 요약을 프롬프트에 주입.
      STT 는 브라우저 Web Speech API 로 시작하고, 전시 셋업에서 로컬 Whisper 로 교체.
- [ ] **P5 브리지**: server/bridge.ts — WebSocket 허브. 페이지가 Action/MirrorEvent 를 publish,
      UE(또는 mock)가 subscribe. 기존 파이썬 mock_unreal 과 포트/어휘 호환(선택: OSC 게이트웨이).
- [ ] **P6 세션 모드**: 키오스크 풀스크린, 세션 타이머(관객 1인 12~15분), 세션 종료 시
      경험 수집 설문(친밀감/불편함/호기심/거리감/이해받음 5축) 로컬 JSON 저장.

## 규약

- 모든 무작위성은 seed 가능하게 (리허설 재현용). `director/rng.ts` 의 mulberry32 사용.
- 거울 반응은 **세션당 상한**이 있다 (기본 8회). 희소해야 귀하다.
- 관객이 먹는 중(chewing)일 때 세컨의 기본 시선은 face↔plate 왕복. 이건 거울이 아니라 주시(注視)다.
- 콘솔 로그 대신 화면 내 '행동 봉투' 패널에 기록 (기존 프로토타입과 동일한 문법).
- 개인정보: 웹캠 프레임은 어떤 형태로도 저장/전송하지 않는다. 신호(SignalEvent)만 남긴다.
  세션 시작 화면에 이 사실을 명시한다.
