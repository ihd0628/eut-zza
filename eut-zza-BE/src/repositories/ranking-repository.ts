import type { Difficulty } from "../domain/beatmap.js";
import type { RankingScoreEntry } from "../domain/ranking.js";
import { pool } from "../db.js";

export type RankingTarget = {
  songId: string;
  difficulty: Difficulty;
};

export const findSongRanking = async (
  songId: string,
  difficulty: Difficulty,
): Promise<RankingScoreEntry[]> => {
  const result = await pool.query<RankingScoreEntry>(
    `
      SELECT
        u.id AS "userId",
        u.email,
        MAX(sc.score) AS "bestScore",
        COUNT(*)::integer AS "playCount"
      FROM scores AS sc
      JOIN game_players AS gp
        ON gp.id = sc.game_player_id
      JOIN users AS u
        ON u.id = gp.user_id
      JOIN game_sessions AS gs
        ON gs.id = gp.game_session_id
      JOIN beatmaps AS b
        ON b.id = gs.beatmap_id
      WHERE b.song_id = $1
        AND b.difficulty = $2
        AND gs.status = 'completed'
      GROUP BY u.id, u.email
      ORDER BY MAX(sc.score) DESC, u.id ASC
    `,
    [songId, difficulty],
  );

  return result.rows;
};

export const findRankingTargetByGameSessionId = async (
  gameSessionId: string,
): Promise<RankingTarget | undefined> => {
  const result = await pool.query<RankingTarget>(
    `
      SELECT
        b.song_id AS "songId",
        b.difficulty
      FROM game_sessions AS gs
      JOIN beatmaps AS b ON b.id = gs.beatmap_id
      WHERE gs.id = $1
        AND gs.status = 'completed'
    `,
    [gameSessionId],
  );

  return result.rows[0];
};

export const findRankingTargetByGamePlayerId = async (
  gamePlayerId: string,
): Promise<RankingTarget | undefined> => {
  const result = await pool.query<RankingTarget>(
    `
      SELECT
        b.song_id AS "songId",
        b.difficulty
      FROM game_players AS gp
      JOIN game_sessions AS gs ON gs.id = gp.game_session_id
      JOIN beatmaps AS b ON b.id = gs.beatmap_id
      WHERE gp.id = $1
        AND gs.status = 'completed'
    `,
    [gamePlayerId],
  );

  return result.rows[0];
};
