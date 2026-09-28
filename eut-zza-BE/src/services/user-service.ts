import type { UserScoreEntry } from "../domain/score.js";
import { UserNotFoundError } from "../domain/user.js";
import { findScoresByUserId } from "../repositories/score-repository.js";
import { findUserById } from "../repositories/user-repository.js";

export const getUserScores = async (
  userId: string,
): Promise<UserScoreEntry[]> => {
  const user = await findUserById(userId);

  if (user === undefined) {
    throw new UserNotFoundError(userId);
  }

  // 사용자는 존재하지만 기록이 없다면 빈 배열을 정상 결과로 반환한다.
  return findScoresByUserId(userId);
};

export const getAuthenticatedUserScores = async (
  userId: string,
): Promise<UserScoreEntry[]> => {
  // 세션 인증 단계에서 존재하는 사용자임을 확인했으므로 다시 조회하지 않는다.
  return findScoresByUserId(userId);
};
