import type { MultiplayerResultEntry } from "../domain/game-session.js";

export type MultiplayerResultCandidate = Omit<
  MultiplayerResultEntry,
  "rank" | "isWinner"
>;

// 점수만 순위 기준으로 사용한다. 같은 점수는 같은 등수이며 공동 1등은 모두 우승자다.
export const rankMultiplayerResults = (
  candidates: MultiplayerResultCandidate[],
): MultiplayerResultEntry[] => {
  const submitted = candidates
    .filter((candidate) => candidate.resultStatus === "submitted" && candidate.score !== null)
    .sort((first, second) => {
      const scoreDifference = (second.score ?? 0) - (first.score ?? 0);
      if (scoreDifference !== 0) return scoreDifference;
      return Number(first.gamePlayerId) - Number(second.gamePlayerId);
    });
  const unfinished = candidates.filter(
    (candidate) => candidate.resultStatus !== "submitted",
  );
  let previousScore: number | null = null;
  let previousRank = 0;

  const ranked = submitted.map((candidate, index): MultiplayerResultEntry => {
    const rank = previousScore === candidate.score ? previousRank : index + 1;
    previousScore = candidate.score;
    previousRank = rank;
    return { ...candidate, rank, isWinner: rank === 1 };
  });

  return [
    ...ranked,
    ...unfinished.map((candidate): MultiplayerResultEntry => ({
      ...candidate,
      rank: null,
      isWinner: false,
    })),
  ];
};
