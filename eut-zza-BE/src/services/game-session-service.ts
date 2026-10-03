import type {
  CompleteSoloGameInput,
  CompletedSoloGame,
  StartedSoloGame,
  SoloSavedResult,
} from "../domain/game-session.js";
import { createSoloGame } from "../repositories/game-session-repository.js";
import { completeSoloGameWithScore, findSoloSavedResult } from "../repositories/score-repository.js";

// Service는 "인증된 사용자가 특정 채보로 솔로 게임을 시작한다"는
// 애플리케이션 기능을 표현한다.
export const startSoloGame = async (
  userId: string,
  beatmapId: string,
): Promise<StartedSoloGame> => {
  return createSoloGame(userId, beatmapId);
};

// 솔로 경기만의 종료 규칙을 표현한다.
// 멀티플레이에서는 참가자 한 명의 결과 제출만으로 경기를 완료하지 않는다.
export const completeSoloGame = async (
  authenticatedUserId: string,
  input: CompleteSoloGameInput,
): Promise<CompletedSoloGame> => {
  return completeSoloGameWithScore(authenticatedUserId, input);
};

export const getSoloSavedResult = async (
  userId: string,
  gameSessionId: string,
): Promise<SoloSavedResult | undefined> => {
  return findSoloSavedResult(userId, gameSessionId);
};
