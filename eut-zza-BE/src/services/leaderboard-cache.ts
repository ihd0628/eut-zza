import type { Difficulty } from "../domain/beatmap.js";
import type { RankingScoreEntry } from "../domain/ranking.js";
import { getRedisClient } from "../redis.js";

const LEADERBOARD_TTL_SECONDS = 24 * 60 * 60;

export interface LeaderboardCache {
  read(
    songId: string,
    difficulty: Difficulty,
  ): Promise<RankingScoreEntry[] | null>;
  replace(
    songId: string,
    difficulty: Difficulty,
    entries: RankingScoreEntry[],
  ): Promise<void>;
}

const keyBase = (songId: string, difficulty: Difficulty) =>
  `eutzza:leaderboard:${songId}:${difficulty}`;

export class RedisLeaderboardCache implements LeaderboardCache {
  async read(
    songId: string,
    difficulty: Difficulty,
  ): Promise<RankingScoreEntry[] | null> {
    const client = await getRedisClient();
    const base = keyBase(songId, difficulty);
    const readyKey = `${base}:ready`;

    const cachedCountValue = await client.get(readyKey);
    if (cachedCountValue === null) return null;
    const cachedCount = Number(cachedCountValue);
    if (!Number.isSafeInteger(cachedCount) || cachedCount < 0) return null;

    const scoreKey = `${base}:scores`;
    const metadataKey = `${base}:metadata`;
    const [scores, metadata] = await Promise.all([
      client.zRangeWithScores(scoreKey, 0, -1, { REV: true }),
      client.hGetAll(metadataKey),
    ]);

    // 일부 key만 유실되거나 제거된 경우 불완전한 캐시를 반환하지 않고 재구성한다.
    if (scores.length !== cachedCount) return null;

    return scores.map(({ value: userId, score: bestScore }) => {
      const serialized = metadata[userId];
      if (serialized === undefined) {
        throw new Error(`Leaderboard metadata is missing for user ${userId}`);
      }

      const parsed = JSON.parse(serialized) as {
        email?: unknown;
        playCount?: unknown;
      };
      if (
        typeof parsed.email !== "string" ||
        typeof parsed.playCount !== "number"
      ) {
        throw new Error(`Leaderboard metadata is invalid for user ${userId}`);
      }

      return {
        userId,
        email: parsed.email,
        bestScore,
        playCount: parsed.playCount,
      };
    });
  }

  async replace(
    songId: string,
    difficulty: Difficulty,
    entries: RankingScoreEntry[],
  ): Promise<void> {
    const client = await getRedisClient();
    const base = keyBase(songId, difficulty);
    const scoreKey = `${base}:scores`;
    const metadataKey = `${base}:metadata`;
    const readyKey = `${base}:ready`;
    const transaction = client.multi()
      .del(scoreKey)
      .del(metadataKey);

    if (entries.length > 0) {
      transaction.zAdd(
        scoreKey,
        entries.map((entry) => ({
          score: entry.bestScore,
          value: entry.userId,
        })),
      );
      transaction.hSet(
        metadataKey,
        Object.fromEntries(entries.map((entry) => [
          entry.userId,
          JSON.stringify({
            email: entry.email,
            playCount: entry.playCount,
          }),
        ])),
      );
      transaction.expire(scoreKey, LEADERBOARD_TTL_SECONDS);
      transaction.expire(metadataKey, LEADERBOARD_TTL_SECONDS);
    }

    // 빈 랭킹도 cache hit로 구분해 PostgreSQL을 매번 다시 조회하지 않는다.
    transaction.set(readyKey, String(entries.length), { EX: LEADERBOARD_TTL_SECONDS });
    await transaction.exec();
  }
}
