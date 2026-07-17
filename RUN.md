# 실행 & 모니터링 (빠른 안내)

## 설치 없이 브라우저로 바로 보기

### GitHub Pages — 빌드는 이미 끝나 있다. 스위치 한 번만.

`main` 에 푸시될 때마다 GitHub Actions 가 앱을 빌드하고 얼굴·영상·3D 메시를 사이트에 구워 넣어
**`gh-pages` 브랜치**로 올린다(자동). 남은 건 **서빙 켜기 한 번** — 저장소 소유자만 할 수 있다:

1. https://github.com/gangmonne/Mysecond_july/settings/pages 로 간다
2. **Build and deployment → Source: Deploy from a branch**
3. **Branch: `gh-pages`** / **`/ (root)`** 선택 → **Save**
4. 1~2분 뒤 라이브: **https://gangmonne.github.io/Mysecond_july/**

한 번 켜두면 이후엔 `main` 에 푸시할 때마다 자동으로 다시 배포된다.
HTTPS 라 **웹캠·음성(STT)·3D 메시가 실제로 동작**한다. (브리지/Claude 프록시는 배포에 없으므로
세컨의 대사는 규칙 기반 폴백. 진짜 대답은 로컬 PC 에서 `npm start` + API 키 또는 Ollama.)

### 그냥 미리 보기 (설정도 필요 없음)

claude.ai Artifact 로 배포된 자율 데모 — 웹캠·마이크 없이 가상의 관객으로 돌며, 무시/지연/열화
미러링·휘발되는 자막·감독 모니터를 보여준다. (외부 파일 로딩이 막힌 환경이라 몸은 점군 형상.)

### Vercel 대안 (3클릭)

레포에 `vercel.json` 이 있어 설정 불필요: vercel.com 로그인 → Add New → Project →
`gangmonne/Mysecond_july` Import → Deploy → `https://<이름>.vercel.app`.

## 딱 한 줄로 켜기

터미널(Mac: 터미널앱 · Windows: PowerShell)을 열고, 프로젝트 폴더로 가서:

```sh
npm start
```

이게 알아서 설치하고 **화면(:5173)** 과 **감독 모니터(:8787)** 를 함께 띄운다.
켜지면 터미널에 **열어야 할 주소가 찍힌다** — 거기 나온 `http://localhost:5173` 을 브라우저로 열면 된다.
멈추려면 그 터미널에서 **Ctrl+C**.

### 세컨이 진짜로 대답하게 하기 (관람객 말 → 세컨 응답)

듣기(STT)는 브라우저에 내장돼 있어 그냥 된다(Chrome, 마이크 허용). **대답의 뇌**는 셋 중 하나 — 위에서부터 시도하고 안 되면 자동 폴백:

1. **Claude API**: `ANTHROPIC_API_KEY=sk-... npm start` 처럼 키를 앞에 붙여 켠다. (제일 좋은 대사)
2. **로컬 LLM (Ollama, 무료·오프라인)**: https://ollama.com 설치 → 터미널에서 `ollama pull llama3.2`
   → 그냥 `npm start`. 브리지가 자동 감지한다. (다른 모델: `OLLAMA_MODEL=qwen2.5 npm start`)
3. **규칙 기반 폴백**: 아무것도 없으면 내장된 짧은 대사들로 계속된다. 세션은 절대 안 죽는다.

세컨은 이제 **소리로도 대답**한다(브라우저 TTS, 기본 켬 — 끄려면 `?voice=0`).
말하는 동안엔 귀(STT)를 닫아 자기 목소리를 되듣지 않는다.

**브리지 없이(배포 페이지에서) 대화하려면**: Ollama 를 CORS 허용으로 켜고
(`OLLAMA_ORIGINS=* ollama serve`) 페이지를 `?brain=ollama` 로 연다 —
gangmonne.github.io 배포본도 그 자리에서 진짜 LLM 과 대화한다. (`&model=qwen2.5` 로 모델 선택)

## UE(언리얼) 실시간 동기화 — 기반 완성

페이지가 브리지로 **연속 표정 피드(face, ≤10fps) + action/mirror/gaze** 를 흘린다.
UE 는 그걸 구독해 메타휴먼을 구동하면 된다 — 매핑표·수신 규약·메시→메타휴먼 파이프라인은
**[unreal/SYNC.md](./unreal/SYNC.md)**. 언리얼 없이 검증: `cd server && npm run mock` (가짜 언리얼).

> 🔴 **"localhost 에서 연결을 거부했습니다 (ERR_CONNECTION_REFUSED)"** 는
> **서버가 안 켜졌다**는 뜻이다. 브라우저를 열기 전에 위 `npm start` 가 먼저 돌고 있어야 하고,
> 그 **터미널 창을 닫으면 안 된다**(창을 닫으면 서버도 꺼진다). 창을 열어둔 채로 주소를 연다.
> `npm start` 가 "포트가 이미 쓰인다"며 죽으면, 이전에 켜둔 걸 끄거나 컴퓨터를 재시작하고 다시 `npm start`.

> ⚠️ `index.html` 을 파일로 직접 더블클릭하면 안 된다(그러면 주소가 `file://…` 라 안 된다).
> 반드시 `npm start` 가 띄운 **http://localhost:5173** 주소로 열어야 한다.

화면에서 **[앉기]** 를 누르면 웹캠 권한을 묻고 세션이 시작된다.

## (선택) 처음 한 번 — 얼굴/3D 자산 로컬로 받기

```sh
cd web && npm run assets:fetch      # 얼굴/idle/3D 를 public/clips 로 받아 경로 고정 (인터넷 필요)
```

> **"file not found"** 는 manifest 가 임시 CDN 주소를 가리키는데 그게 만료됐을 때 뜬다.
> `assets:fetch` 를 한 번 돌리면 파일이 로컬로 들어와 다시는 안 뜬다.
> (안 받아도 몸은 코드로 만든 '형상'(점군)으로 뜨므로 화면이 비지는 않는다.)

## 모니터링 — "지금 어디까지 왔나"

운영자 화면(관객에겐 안 보인다)을 여는 법. **제일 쉬운 것부터:**

1. **[앉기]** 로 시작한 뒤, **마우스를 조금 움직이면** 화면 아래에 **`◉ 감독 모니터`** 버튼이 뜬다 → 클릭.
   (마우스를 멈추면 버튼은 사라진다 — 관객이 볼 땐 안 보이게.)
2. 시작 화면의 **"감독 모니터 열기"** 버튼.
3. **`m` 키** (이음새 조정은 `t`).
4. 주소 끝에 **`?monitor=1`** → `http://localhost:5173/?monitor=1`.
5. **다른 기기**(옆 노트북·폰)에서 → `http://localhost:8787/monitor` (아래 참고).

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
| `?live=1` | **리허설 전용**: 웹캠 표정을 형상에 실시간 직결 (본 세션에선 금지 — 정확한 미러링은 실패다) |

## 5) 리허설 훅 (마이크·웹캠 없이)

개발 서버에서 브라우저 콘솔에:

```js
__second.say("맛있어?")          // 세컨이 한 문장 발화 (자막이 허공에 흩어진다)
__second.signal("reach_hand")     // 관객 몸짓 신호를 흘려넣기 (거울 반응 유도)
__second.monitor()                // 감독 모니터 토글
__second.face(0.9, 0, 0.5)        // 가짜 표정 프레임 (jaw, smile, brow) — ?live=1 이면 즉시 얼굴에
__second.replay(0.4)              // 합성 찡그림 스니펫을 fidelity 0.4 로 지연 재생
```

## 6) 원격 감독 모니터 (다른 기기에서 보기)

관객 PC를 건드리지 않고, **다른 노트북·태블릿·폰**으로 세션을 실시간 감시한다.
`npm start` 를 쓰면 브리지(:8787)가 이미 같이 떠 있다.

1. 관객 PC에서 `npm start` 가 돌고 있는지 확인 (브리지 :8787 포함).
2. 감시용 기기 브라우저에서 연다:
   - 같은 PC: **http://localhost:8787/monitor**
   - 같은 와이파이의 다른 기기: **http://<관객 PC의 IP>:8787/monitor**
     (PC IP 확인 — mac: `ipconfig getifaddr en0`, win: `ipconfig`)

세션 페이지가 500ms 마다 상태를 브리지로 흘리고, 이 페이지가 받아 그린다:
남은 시간 · 거울 발화 수 · 준비 중인 몸짓 카운트다운 · 쿨다운 · 발화/시선 · 채널 · 최근 신호.
세션이 죽으면 상단에 "세션 신호 끊김" 이 뜬다.

> `[m]`/`?monitor=1`/좌상단 클릭은 **관객 화면 위에** 겹쳐 여는 로컬 모니터,
> `/monitor` 는 **다른 기기에서** 여는 원격 모니터다. 둘 다 같은 상태를 본다.
