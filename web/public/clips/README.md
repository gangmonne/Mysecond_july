# 클립 뱅크 규약 (`/clips/{state}.webm`)

UE 시퀀서에서 메타휴먼을 상태별 고화질 클립으로 렌더해 이 폴더에 배치한다.
클립이 없으면 렌더러가 자리표시 카드(`[ state ]` 텍스트)로 대체해 파이프라인을 먼저 굴린다.

| 파일 | 내용 |
| --- | --- |
| `idle_a.webm` `idle_b.webm` `idle_c.webm` | 3~6초 루프, 미세하게 다른 호흡 |
| `talk_loop.webm` | 발화 루프 (desync 는 자막 시작점과의 차이로 발생) |
| `gaze_face.webm` `gaze_plate.webm` `gaze_away.webm` | 시선 전환 (eyes lead head 로 미리 애니메이팅) |
| `frown.webm` `smile.webm` `reach_hand.webm` `lean_in.webm` `head_tilt.webm` | 몸짓 — 원위치 복귀 포함 |
| `eat_mimic.webm` | 수저가 입 앞에서 멈추는 그 비트 |

- 권장: 1920×1080, VP9, 알파 불필요, 오디오 없음.
- 열화(fidelity)는 클립을 다시 렌더하지 않는다 — 재생속도(0.88~1.0)·불투명도·CSS 글리치로 표현한다.
