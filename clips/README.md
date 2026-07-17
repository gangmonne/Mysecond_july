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

## manifest.json (선택) — 포스터/원격 소스 매핑

`manifest.json` 이 있으면 클립뱅크가 그걸 먼저 읽는다:

```json
{
  "poster": "얼굴 정지 이미지 URL 또는 /clips/poster.jpg",
  "clips": { "idle_a": "…/idle.mp4", "talk_loop": "/clips/talk_loop.webm" }
}
```

- `poster` — 클립이 아직 없어도 몸엔 얼굴이 깔린다. 영상 클립이 재생되면 그 위를 덮고,
  클립이 없거나 로드 실패하면 다시 포스터로 물러난다 (텍스트 자리표시는 포스터가 없을 때만).
- `clips` — 상태명 → 소스 URL. 원격 URL(CDN)도 되지만 전시에선 로컬 파일을 권장한다.
- 현재 커밋된 manifest 는 Higgsfield 로 만든 플레이스홀더(동양인 여성·안경, idle 브리딩 루프)를
  가리킨다. CDN URL 은 임시라 만료될 수 있으니, 로컬로 받아 경로를 바꾸는 걸 권한다:
  `curl -L <url> -o web/public/clips/idle_a.mp4` 후 manifest 의 값을 `/clips/idle_a.mp4` 로.
