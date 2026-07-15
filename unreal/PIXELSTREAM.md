# UE5 Pixel Streaming 셋업 (전시 본선)

1. UE 5.4+ 프로젝트에 Pixel Streaming 플러그인 활성화, 메타휴먼 임포트(고해상도 스캔 → Mesh to MetaHuman).
2. 실행 인자: `-PixelStreamingURL=ws://localhost:8888 -RenderOffscreen -Unattended`
3. SignallingWebServer (Epic 제공) 기동 → web/ 의 PixelStreamRenderer 가 접속.
4. 데이터 채널 수신: OnPixelStreamingInputEvent → JSON 파싱 → BP_SecondDirector 함수 라우팅.
   어휘는 contract.ts 와 동일: action / mirror / gaze.
5. mirror 구현: gesture 별 몽타주(frown/smile/reach_hand/lean_in/head_tilt)를
   fidelity 로 블렌드 가중치·재생속도를 낮춰 재생. 완벽 재현 금지 — 열화가 사양이다.
6. 립싱크: TTS 오디오 → Audio2Face 계열 또는 UE 오디오 커브 → 메타휴먼 페이셜.
   desync_ms 는 자막 시작 시각과 페이셜 시작 시각의 차이로 구현.
