import type { Difficulty } from "../domain/beatmap.js";
import type {
  RankingEntry,
  RankingScoreEntry,
} from "../domain/ranking.js";
import {
  findRankingTargetByGamePlayerId,
  findRankingTargetByGameSessionId,
  findSongRanking,
  type RankingTarget,
} from "../repositories/ranking-repository.js";
import type { LeaderboardCache } from "./leaderboard-cache.js";

const compareUserIds = (first: string, second: string): number => {
  try {
    const firstId = BigInt(first);
    const secondId = BigInt(second);
    return firstId < secondId ? -1 : firstId > secondId ? 1 : 0;
  } catch {
    return first.localeCompare(second);
  }
};

export const assignCompetitionRanks = (
  entries: RankingScoreEntry[],
  limit = 10,
): RankingEntry[] => {
  const sorted = [...entries].sort((first, second) =>
    second.bestScore - first.bestScore || compareUserIds(first.userId, second.userId));
  let previousScore: number | undefined;
  let currentRank = 0;

  return sorted.slice(0, limit).map((entry, index) => {
    if (entry.bestScore !== previousScore) currentRank = index + 1;
    previousScore = entry.bestScore;
    return { ...entry, rank: currentRank };
  });
};

export class LeaderboardService {
  constructor(private readonly cache: LeaderboardCache) {}

  async getRanking(
    songId: string,
    difficulty: Difficulty,
  ): Promise<RankingEntry[]> {
    try {
      const cached = await this.cache.read(songId, difficulty);
      if (cached !== null) return assignCompetitionRanks(cached);
    } catch (error: unknown) {
      console.error("[Leaderboard] Redis read failed; using PostgreSQL", error);
    }

    const entries = await findSongRanking(songId, difficulty);
    await this.replaceBestEffort({ songId, difficulty }, entries);
    return assignCompetitionRanks(entries);
  }

  async refreshForGameSession(gameSessionId: string): Promise<void> {
    try {
      const target = await findRankingTargetByGameSessionId(gameSessionId);
      if (target !== undefined) await this.refreshTarget(target);
    } catch (error: unknown) {
      // 파생 랭킹 갱신은 원본 경기 결과 저장의 성공 여부를 바꾸지 않는다.
      console.error("[Leaderboard] Failed to refresh completed game", error);
    }
  }

  async refreshForGamePlayer(gamePlayerId: string): Promise<void> {
    try {
      const target = await findRankingTargetByGamePlayerId(gamePlayerId);
      if (target !== undefined) await this.refreshTarget(target);
    } catch (error: unknown) {
      console.error("[Leaderboard] Failed to refresh submitted score", error);
    }
  }

  private async refreshTarget(target: RankingTarget): Promise<void> {
    const entries = await findSongRanking(target.songId, target.difficulty);
    await this.replaceBestEffort(target, entries);
  }

  private async replaceBestEffort(
    target: RankingTarget,
    entries: RankingScoreEntry[],
  ): Promise<void> {
    try {
      await this.cache.replace(target.songId, target.difficulty, entries);
    } catch (error: unknown) {
      // Redis 파생 데이터 실패가 PostgreSQL 원본 점수 저장을 실패로 바꾸지 않는다.
      console.error("[Leaderboard] Redis refresh failed", error);
    }
  }
}
