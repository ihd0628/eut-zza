import {
  GamePlayerNotFoundError,
  ScoreSubmissionForbiddenError,
  type CreateScoreInput,
  type Score,
} from "../domain/score.js";
import {
  createScore,
  findGamePlayerOwnerId,
} from "../repositories/score-repository.js";
import type { LeaderboardService } from "./leaderboard-service.js";

export const submitScore = async (
  authenticatedUserId: string,
  input: CreateScoreInput,
  leaderboardService: LeaderboardService,
): Promise<Score> => {
  const ownerUserId = await findGamePlayerOwnerId(input.gamePlayerId);

  if (ownerUserId === undefined) {
    throw new GamePlayerNotFoundError();
  }

  if (ownerUserId !== authenticatedUserId) {
    throw new ScoreSubmissionForbiddenError();
  }

  const score = await createScore(input);
  await leaderboardService.refreshForGamePlayer(score.gamePlayerId);
  return score;
};
