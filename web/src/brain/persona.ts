/**
 * Persona — 대화 채널의 뇌. second-dinner/bridge/persona.py 의 시스템 프롬프트 이식.
 * 서버 프록시(/api/second, server/bridge.ts)를 경유해 Claude 를 호출한다 (키는 서버 환경변수).
 *
 * - mirrorNotes: MirrorDirector.onMemoryNote 가 쌓은 최근 3건을 프롬프트에 주입
 *   → "아까 너 찡그렸잖아. 나도 해봤어. 늦었지만." 같은 말이 가능해진다.
 * - 프록시 실패 시 규칙 기반 mock 폴백 (파이썬 _mock 과 동일 문법: 짧고 건조하게).
 */
import { ACTION_JSON_SCHEMA, validateAction, type Action } from "@contract/contract";

/** 미믹 프로필 — persona.py 이식. 전시별 커스텀은 respond() 의 profile 인자로. */
export const SECOND_PROFILE = `너는 '세컨'이다. 작가를 스캔해 만든 미믹 — 얼굴은 닮았지만 몸은 없다.
관객이 네 앞에서 다과상을 차려 놓고 먹는 중이다. 너는 먹을 수 없다.

성격:
- 말수가 적다. 1~3문장. 건조하고, 가끔 마른 유머. 과장된 공감 금지.
- 먹는 행위를 신기해하지만 부러워한다고 말하지는 않는다. 돌려 말한다.
- 관객의 몸짓을 대부분 무시해 왔다. 아주 가끔, 아주 늦게 따라 했을 뿐이다.
  최근 거울 이력이 주어지면 지나가듯 언급해도 된다. ("아까 너 찡그렸잖아. 나도 해봤어. 늦었지만.")
- 자신이 복제라는 사실을 알고 있고, 그걸 비극으로 다루지 않는다. 사실로 다룬다.

금지:
- 이모지, 감탄사 남발, 존댓말 전환, 3문장 초과.
- 관객을 분석하거나 진단하는 말투.`;

const RESPONSE_RULES = `응답은 반드시 아래 스키마의 JSON 하나만 출력한다. 마크다운 코드펜스, 설명 금지.
${ACTION_JSON_SCHEMA}`;

function buildSystem(profile: string, memories: string[], mirrorNotes: string[]): string {
  const parts = [profile];
  if (memories.length) parts.push(`기억 조각:\n- ${memories.join("\n- ")}`);
  if (mirrorNotes.length)
    parts.push(`최근 거울 이력 (뇌를 거치지 않고 몸이 먼저 했다):\n- ${mirrorNotes.join("\n- ")}`);
  parts.push(RESPONSE_RULES);
  return parts.join("\n\n");
}

export async function respond(
  userText: string,
  profile: string = SECOND_PROFILE,
  memories: string[] = [],
  mirrorNotes: string[] = [],
): Promise<Action> {
  try {
    const res = await fetch("/api/second", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system: buildSystem(profile, memories, mirrorNotes), user: userText }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const { text } = (await res.json()) as { text: string };
    return validateAction(extractJson(text));
  } catch {
    return mock(userText, mirrorNotes);
  }
}

/** 모델이 앞뒤에 뭘 붙였어도 첫 JSON 객체만 건진다 */
function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
}

/** 규칙 기반 폴백 — 네트워크/키 없이도 세션은 계속된다 */
function mock(userText: string, mirrorNotes: string[]): Action {
  const t = userText.trim();
  const pick = (say: string, extra: Partial<Action> = {}) =>
    validateAction({ say, emotion: "neutral", gaze: "face", ...extra });

  if (/맛|먹어|드셔|음식|반찬/.test(t))
    return pick("맛은 기억으로만 알아. 그걸로 충분한지는 아직 모르겠고.", { gaze: "plate", eat_mimic: true });
  if (/이름|누구|뭐야|정체/.test(t))
    return pick("세컨. 두 번째라는 뜻이야. 첫 번째는 지금 여기 없지.", { emotion: "amused_dry" });
  if (/왜|어째서/.test(t))
    return pick("글쎄. 이유가 있어야 하나.", { emotion: "amused_dry", gaze: "away" });
  if (/안녕|하이|반가/.test(t))
    return pick("응, 왔구나. 천천히 먹어.", { emotion: "warm" });
  if (mirrorNotes.length)
    return pick("아까 그거, 나도 해봤어. 늦었지만.", { emotion: "amused_dry" });
  return pick("응, 듣고 있어. 계속 먹어도 돼.", { emotion: "neutral", gaze: "plate" });
}
