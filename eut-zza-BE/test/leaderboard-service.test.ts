import assert from "node:assert/strict";
import { test } from "node:test";
import { assignCompetitionRanks } from "../src/services/leaderboard-service.js";

test("동점에는 공동 순위를 부여하고 다음 순위는 건너뛴다", () => {
  const ranking = assignCompetitionRanks([
    { userId: "3", email: "third@example.com", bestScore: 800, playCount: 1 },
    { userId: "2", email: "second@example.com", bestScore: 1_000, playCount: 2 },
    { userId: "1", email: "first@example.com", bestScore: 1_000, playCount: 3 },
  ]);

  assert.deepEqual(
    ranking.map(({ userId, bestScore, rank }) => ({ userId, bestScore, rank })),
    [
      { userId: "1", bestScore: 1_000, rank: 1 },
      { userId: "2", bestScore: 1_000, rank: 1 },
      { userId: "3", bestScore: 800, rank: 3 },
    ],
  );
});

test("랭킹 응답은 점수순 상위 10명으로 제한한다", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    userId: String(index + 1),
    email: `${index + 1}@example.com`,
    bestScore: index * 100,
    playCount: 1,
  }));

  const ranking = assignCompetitionRanks(entries);

  assert.equal(ranking.length, 10);
  assert.equal(ranking[0]?.bestScore, 1_100);
  assert.equal(ranking.at(-1)?.bestScore, 200);
});
