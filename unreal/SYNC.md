# UE 실시간 동기화 규약 — 웹 ↔ 브리지 ↔ 메타휴먼

최종 형태: **[웹캠/음성] → [뇌(LLM)] → [언리얼 메타휴먼 실시간 구동]**.
페이지는 감각·뇌·디렉터를 담당하고, UE 는 몸(고화질 렌더)만 담당한다.
언리얼 없이 파이프라인을 검증하려면: `cd server && npm start` + `npm run mock` (가짜 언리얼).

## 1) 연결

두 경로 중 하나 (어휘는 동일 — contract/contract.ts 가 단일 진실원):

| 경로 | 방법 | 권장 |
| --- | --- | --- |
| **WebSocket** | UE 의 WebSocket 클라이언트(예: `WebSocketBlueprint` 플러그인)로 `ws://<PC>:8787/ws` 구독 | 리허설·개발 |
| **Pixel Streaming 데이터 채널** | 페이지의 PixelStreamRenderer 가 `emitUIInteraction(json)` 으로 직접 송신 → `OnPixelStreamingInputEvent` | 전시 본선 |
| (옵션) **OSC** | 브리지를 `OSC_UDP_PORT=7000` 으로 켜면 `/second/action`·`/second/mirror` UDP 송출 | 레거시 호환 |

## 2) 받는 메시지 4종 (JSON)

### `action` — 대사 한 턴 (저빈도)
```json
{ "kind":"action", "say":"응, 듣고 있어.", "emotion":"warm", "gaze":"face",
  "gaze_curve":"eyes_lead_head", "eat_mimic":false,
  "glitch":{ "expr_freeze":0.2, "desync_ms":340, "texture_break":0.1 } }
```
→ TTS 재생 + 립싱크(오디오 커브 → 페이셜), `desync_ms` 는 자막(웹) 대비 페이셜 시작 지연으로 구현.
`emotion` 은 표정 프리셋 블렌드, `eat_mimic` 은 수저 몽타주.

### `mirror` — 늦은 몸짓 (드묾 — 세션당 ≤8회)
```json
{ "kind":"mirror", "gesture":"frown", "source_t":1789..., "delay_ms":12400, "fidelity":0.55 }
```
→ gesture 별 몽타주를 **fidelity 로 블렌드 가중치·재생속도를 낮춰** 재생. 완벽 재현 금지 — 열화가 사양이다.
gesture 어휘: frown smile surprised pout nod shake reach_hand lean_in head_tilt.
지연은 디렉터가 이미 소화했다 — 받는 즉시 재생한다.

### `gaze` — 시선 힌트 (저빈도)
```json
{ "kind":"gaze", "target":"plate" }
```
→ face | plate | away. eyes-lead-head 로 전환.

### `face` — 연속 표정 프레임 (**≤10fps**, 실시간 동기화의 본체)
```json
{ "kind":"face", "t":1789..., "jaw":0.34, "smile":0.05, "brow":0.6,
  "browUp":0.0, "blink":0.1, "yaw":-0.12, "pitch":0.08, "roll":0.03 }
```

**메타휴먼(ARKit) 매핑표** — 값은 0..1, 각도는 라디안:

| face 필드 | 메타휴먼 컨트롤 (ARKit 이름) | 비고 |
| --- | --- | --- |
| `jaw` | `JawOpen` | 그대로 |
| `smile` | `MouthSmileLeft` + `MouthSmileRight` | 동일 값 |
| `brow` | `BrowDownLeft` + `BrowDownRight` | 찡그림 |
| `browUp` | `BrowInnerUp` | 놀람 성분 |
| `blink` | `EyeBlinkLeft` + `EyeBlinkRight` | 동일 값 |
| `yaw` | 목/머리 본 Z 회전 = `yaw × 57.3°` × **−1** | 거울 반전은 연출 선택 |
| `pitch` | 목/머리 본 Y 회전 = `pitch × 57.3°` | +아래 |
| `roll` | 목/머리 본 X 회전 = `roll × 57.3°` | |

구현: Blueprint 에서 10fps 값을 그대로 꽂지 말고 **Interp(6~10 speed)로 수렴**시켜라
(웹 spatial 렌더러도 같은 방식: 붙을 땐 빠르게 0.16, 떨어질 땐 느리게 0.05).

⚠️ **미학 주의**: `face` 피드를 메타휴먼에 **직결(라이브 미러)하는 건 리허설 전용**이다.
본 세션의 표정은 `mirror` 이벤트가 왔을 때, 그 몸짓 순간의 스니펫을 뒤늦게 열화 재생한다
(웹 셸이 이 게이팅을 담당하므로 UE 는 받은 것만 재생하면 된다). 정확한 미러링은 이 작품에서 실패다.

## 3) 텍스처 메시 → 메타휴먼 (지금 가진 자산에서 출발)

레포의 `web/public/clips/mesh.glb` (Higgsfield image_to_3d, 텍스처+리깅) 는 프록시다.
고화질 본선으로 가는 길:

1. **Identity**: `poster.png`(정면 얼굴) → UE **MetaHuman Creator 의 Mesh to MetaHuman**
   (mesh.glb 를 Blender 에서 FBX 로 변환해 임포트 → identity solve) 또는 poster 기반 스컬프팅.
2. **텍스처**: poster.png 를 앨비도 참조로 스킨 톤/주근깨 매칭.
3. **페이셜**: 메타휴먼 표준 rig 그대로 — 위 ARKit 매핑표가 그대로 붙는다.
4. **립싱크**: TTS 오디오(웹 or UE) → Audio2Face 계열 또는 UE 오디오 커브 → 페이셜.
   `desync_ms` 는 자막 시작과 페이셜 시작의 차이로.

## 4) 검증 루프 (언리얼 없이)

```sh
npm start                  # 루트에서 — 페이지(:5173) + 브리지(:8787)
cd server && npm run mock  # 가짜 언리얼 — UE 가 받을 것을 그대로 출력
```
페이지에서 [앉기] 후 mock 터미널에 `FACE 10fr …`, `ACTION say=…`, `MIRROR frown +12400ms fidelity=0.55`
가 흐르면 — UE 를 꽂을 자리가 완성된 것이다.
