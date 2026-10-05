import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rankMultiplayerResults,
  type MultiplayerResultCandidate,
} from "../src/services/multiplayer-ranking.js";

const candidate = (
  gamePlayerId: string,
  score: number | null,
  resultStatus: MultiplayerResultCandidate["resultStatus"] = "submitted",
): MultiplayerResultCandidate => ({
  userId: gamePlayerId,
  email: `${gamePlayerId}@example.com`,
  gamePlayerId,
  resultStatus,
  score,
  perfectCount: score === null ? null : 1,
  greatCount: score === null ? null : 0,
  goodCount: score === null ? null : 0,
  missCount: score === null ? null : 0,
  maxCombo: score === null ? null : 1,
});

test("같은 점수는 공동 순위와 공동 우승으로 계산한다", () => {
  const ranking = rankMultiplayerResults([
    candidate("1", 90_000),
    candidate("2", 100_000),
    candidate("3", 100_000),
    candidate("4", null, "disconnected"),
  ]);

  assert.deepEqual(
    ranking.map(({ gamePlayerId, rank, isWinner, resultStatus }) => ({
      gamePlayerId,
      rank,
      isWinner,
      resultStatus,
    })),
    [
      { gamePlayerId: "2", rank: 1, isWinner: true, resultStatus: "submitted" },
      { gamePlayerId: "3", rank: 1, isWinner: true, resultStatus: "submitted" },
      { gamePlayerId: "1", rank: 3, isWinner: false, resultStatus: "submitted" },
      { gamePlayerId: "4", rank: null, isWinner: false, resultStatus: "disconnected" },
    ],
  );
});

test("제출 시간 초과 참가자는 점수와 순위가 없는 DNF로 계산한다", () => {
  const ranking = rankMultiplayerResults([
    candidate("1", 50_000),
    candidate("2", null, "timed_out"),
  ]);

  assert.deepEqual(
    ranking.map(({ gamePlayerId, rank, isWinner, resultStatus }) => ({
      gamePlayerId,
      rank,
      isWinner,
      resultStatus,
    })),
    [
      { gamePlayerId: "1", rank: 1, isWinner: true, resultStatus: "submitted" },
      { gamePlayerId: "2", rank: null, isWinner: false, resultStatus: "timed_out" },
    ],
  );
});
