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

export const submitScore = async (
  authenticatedUserId: string,
  input: CreateScoreInput,
): Promise<Score> => {
  const ownerUserId = await findGamePlayerOwnerId(input.gamePlayerId);

  if (ownerUserId === undefined) {
    throw new GamePlayerNotFoundError();
  }

  if (ownerUserId !== authenticatedUserId) {
    throw new ScoreSubmissionForbiddenError();
  }

  return createScore(input);
};
