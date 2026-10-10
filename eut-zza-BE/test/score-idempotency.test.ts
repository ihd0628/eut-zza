import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreMatchesInput, type Score } from "../src/domain/score.js";

const savedScore: Score = {
  id: "10",
  gamePlayerId: "20",
  score: 990_000,
  perfectCount: 3,
  greatCount: 1,
  goodCount: 0,
  missCount: 0,
  maxCombo: 4,
};

test("같은 경기 결과 재전송은 동일한 요청으로 판별한다", () => {
  const { id: _id, ...sameInput } = savedScore;
  assert.equal(scoreMatchesInput(savedScore, sameInput), true);
});

test("결과 필드가 하나라도 다르면 충돌 요청으로 판별한다", () => {
  const { id: _id, ...sameInput } = savedScore;
  assert.equal(scoreMatchesInput(savedScore, { ...sameInput, score: 980_000 }), false);
  assert.equal(scoreMatchesInput(savedScore, { ...sameInput, missCount: 1 }), false);
});
