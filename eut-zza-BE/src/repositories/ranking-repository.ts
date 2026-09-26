import type { Difficulty } from "../domain/beatmap.js";
import type { RankingEntry } from "../domain/ranking.js";
import { pool } from "../db.js";

export const findSongRanking = async (
  songId: string,
  difficulty: Difficulty,
): Promise<RankingEntry[]> => {
  const result = await pool.query<RankingEntry>(
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
      LIMIT 10
    `,
    [songId, difficulty],
  );

  return result.rows;
};
