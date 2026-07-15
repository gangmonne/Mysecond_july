# 실행 & 모니터링 (빠른 안내)

## 1) 처음 한 번 — 설치와 자산 받기

```sh
cd web
npm install               # 의존성 + MediaPipe wasm 로컬 복사(자동)
npm run assets:fetch      # 얼굴/idle/3D 를 public/clips 로 내려받아 경로 고정 (인터넷 필요)
```

> **"file not found" 가 뜨는 이유:** manifest 가 처음엔 임시 CDN 주소를 가리킨다.
> 그 링크는 만료될 수 있다. `npm run assets:fetch` 를 한 번 돌리면 파일이 `web/public/clips/`
> 안으로 들어오고 manifest 가 로컬 경로(`/clips/...`)로 바뀌어 다시는 안 뜬다.
> (자산을 못 받아도 몸은 코드로 만든 '형상'(점군)으로 뜨므로 화면이 비지는 않는다.)

## 2) 띄우기

```sh
# (선택) 대화/브리지 서버 — 없어도 됨. 있으면 Claude 응답 + 설문 저장
cd server && npm install && ANTHROPIC_API_KEY=sk-... npm start   # :8787

# 페이지
cd web && npm run dev        # http://localhost:5173  ← 브라우저에서 이 주소로 연다
```

> ⚠️ `index.html` 을 파일로 직접 더블클릭하면 안 된다(모듈 로딩 실패 → file not found).
> 반드시 `npm run dev` 가 띄운 **http://localhost:5173** 주소로 열어야 한다.

화면에서 **[앉기]** 를 누르면 웹캠 권한을 묻고 세션이 시작된다.

## 3) 모니터링 — "지금 어디까지 왔나"

운영자 화면(관객에겐 안 보인다)을 여는 **3가지 방법**:

1. **`m` 키** 를 누른다.
2. 주소 끝에 **`?monitor=1`** 을 붙여서 연다 → `http://localhost:5173/?monitor=1`
3. 화면 **좌상단 구석을 클릭** 한다 (작은 보이지 않는 영역).

열리면 실시간으로: 경과/남은 시간 · 거울 발화 수(상한 대비) · 준비 중인 몸짓 카운트다운 ·
쿨다운 · 채널 상태(cam/bridge/stream/stt) · 최근 신호 · 하단에 '행동 봉투' 결정 로그.

`t` 키는 **이음새 조정**(무시 확률/지연/열화/쿨다운/상한 슬라이더).

## 4) URL 파라미터

| 파라미터 | 뜻 |
| --- | --- |
| `?seed=42` | 난수 시드(리허설 재현) |
| `?min=13` | 세션 길이(분, 최대 15) |
| `?body=spatial` | 3D 형상 몸 (기본) · `?body=clip` 이면 FMV 영상 몸 |
| `?stream=ws://host:8888` | UE Pixel Streaming(전시 본선). 끊기면 자동 폴백 |
| `?monitor=1` | 감독 모니터를 열고 시작 |

## 5) 리허설 훅 (마이크·웹캠 없이)

개발 서버에서 브라우저 콘솔에:

```js
__second.say("맛있어?")          // 세컨이 한 문장 발화 (자막이 허공에 흩어진다)
__second.signal("reach_hand")     // 관객 몸짓 신호를 흘려넣기 (거울 반응 유도)
__second.monitor()                // 감독 모니터 토글
```
