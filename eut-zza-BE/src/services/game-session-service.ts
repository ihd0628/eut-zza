import type { StartedSoloGame } from "../domain/game-session.js";
import { createSoloGame } from "../repositories/game-session-repository.js";

// Service는 "인증된 사용자가 특정 채보로 솔로 게임을 시작한다"는
// 애플리케이션 기능을 표현한다.
export const startSoloGame = async (
  userId: string,
  beatmapId: string,
): Promise<StartedSoloGame> => {
  return createSoloGame(userId, beatmapId);
};
