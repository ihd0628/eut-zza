import type { CreateScoreInput, Score } from "../domain/score.js";
import { createScore } from "../repositories/score-repository.js";

// 지금은 저장만 위임하지만, 이후 인증과 게임 결과 검증 규칙은 이 계층에 추가한다.
export const submitScore = async (
  input: CreateScoreInput,
): Promise<Score> => {
  return createScore(input);
};
