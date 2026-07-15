/**
 * Persona — 기존 second-dinner/bridge/persona.py 이식 지점.
 * 시스템 프롬프트 = 미믹 프로필 + RAG 기억 + 최근 MirrorEvent 요약 + ACTION_JSON_SCHEMA 강제.
 *
 * Claude Code P4 작업:
 *  - server/ 에 /api/second 프록시 (Anthropic SDK, 키는 서버 환경변수)
 *  - mirrorNotes: MirrorDirector.onMemoryNote 가 쌓은 최근 3건을 프롬프트에 주입
 *    → 세컨이 "아까 너 찡그렸잖아. 나도 해봤어. 늦었지만." 같은 말을 할 수 있게 된다
 *  - STT: Web Speech API (ko-KR) → 전시에서 로컬 Whisper 로 교체
 *  - 실패 시 규칙 기반 mock 폴백 (파이썬 _mock 과 동일 어휘)
 */
import { validateAction, type Action } from "@contract/contract";

export async function respond(
  _userText: string,
  _profile: string,
  _memories: string[],
  _mirrorNotes: string[],
): Promise<Action> {
  // P4 에서 구현. 지금은 계약이 살아있음을 보이는 최소 응답.
  return validateAction({ say: "응, 듣고 있어. 천천히 먹어.", emotion: "warm", gaze: "face" });
}
