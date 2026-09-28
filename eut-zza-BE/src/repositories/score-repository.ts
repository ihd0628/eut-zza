import { DatabaseError } from "pg";
import { pool } from "../db.js";
import {
  GamePlayerNotFoundError,
  ScoreAlreadyExistsError,
  type CreateScoreInput,
  type Score,
  type UserBestScoreEntry,
  type UserScoreEntry,
} from "../domain/score.js";

type GamePlayerOwnerRow = {
  userId: string;
};

export const findGamePlayerOwnerId = async (
  gamePlayerId: string,
): Promise<string | undefined> => {
  const result = await pool.query<GamePlayerOwnerRow>(
    `
      SELECT user_id AS "userId"
      FROM game_players
      WHERE id = $1
    `,
    [gamePlayerId],
  );

  return result.rows[0]?.userId;
};

export const createScore = async (input: CreateScoreInput): Promise<Score> => {
  try {
    const result = await pool.query<Score>(
      `
        INSERT INTO scores (
          game_player_id,
          score,
          perfect_count,
          great_count,
          good_count,
          miss_count,
          max_combo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          game_player_id AS "gamePlayerId",
          score,
          perfect_count AS "perfectCount",
          great_count AS "greatCount",
          good_count AS "goodCount",
          miss_count AS "missCount",
          max_combo AS "maxCombo"
      `,
      [
        input.gamePlayerId,
        input.score,
        input.perfectCount,
        input.greatCount,
        input.goodCount,
        input.missCount,
        input.maxCombo,
      ],
    );

    // INSERT ... RETURNING은 정상 저장되면 반드시 한 행을 반환한다.
    const score = result.rows[0];

    if (score === undefined) {
      throw new Error("Inserted score was not returned");
    }

    return score;
  } catch (error: unknown) {
    if (
      error instanceof DatabaseError &&
      error.code === "23505" &&
      error.constraint === "scores_game_player_id_key"
    ) {
      throw new ScoreAlreadyExistsError();
    }

    if (
      error instanceof DatabaseError &&
      error.code === "23503" &&
      error.constraint === "scores_game_player_id_fkey"
    ) {
      throw new GamePlayerNotFoundError();
    }

    throw error;
  }
};

export const findScoresByUserId = async (
  userId: string,
): Promise<UserScoreEntry[]> => {
  const result = await pool.query<UserScoreEntry>(
    `
      SELECT
        sc.id AS "scoreId",
        gs.id AS "gameSessionId",
        so.title AS "songTitle",
        b.difficulty,
        sc.score,
        sc.max_combo AS "maxCombo"
      FROM scores AS sc
      JOIN game_players AS gp
        ON gp.id = sc.game_player_id
      JOIN game_sessions AS gs
        ON gs.id = gp.game_session_id
      JOIN beatmaps AS b
        ON b.id = gs.beatmap_id
      JOIN songs AS so
        ON so.id = b.song_id
      WHERE gp.user_id = $1
        AND gs.status = 'completed'
      ORDER BY gs.ended_at DESC NULLS LAST, sc.id DESC
      LIMIT 20
    `,
    [userId],
  );

  return result.rows;
};

export const findBestScoresByUserId = async (
  userId: string,
): Promise<UserBestScoreEntry[]> => {
  const result = await pool.query<UserBestScoreEntry>(
    `
      SELECT
        so.id AS "songId",
        so.title AS "songTitle",
        b.id AS "beatmapId",
        b.difficulty,
        MAX(sc.score) AS "bestScore",
        COUNT(*)::integer AS "playCount"
      FROM scores AS sc
      JOIN game_players AS gp
        ON gp.id = sc.game_player_id
      JOIN game_sessions AS gs
        ON gs.id = gp.game_session_id
      JOIN beatmaps AS b
        ON b.id = gs.beatmap_id
      JOIN songs AS so
        ON so.id = b.song_id
      WHERE gp.user_id = $1
        AND gs.status = 'completed'
      GROUP BY
        so.id,
        so.title,
        b.id,
        b.difficulty
      ORDER BY MAX(sc.score) DESC, b.id ASC
    `,
    [userId],
  );

  return result.rows;
};
