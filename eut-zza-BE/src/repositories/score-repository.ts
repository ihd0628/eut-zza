import { DatabaseError } from "pg";
import { pool } from "../db.js";
import {
  SoloGameCompletionForbiddenError,
  SoloGameNotFoundError,
  SoloGameNotPlayingError,
  type CompleteSoloGameInput,
  type CompletedSoloGame,
  type GameSession,
  type SoloSavedResult,
} from "../domain/game-session.js";
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

type SoloGameCompletionContext = GameSession & {
  gamePlayerId: string;
  userId: string;
};

type SoloSavedResultRow = Pick<
  SoloSavedResult,
  "gameSessionId" | "songTitle" | "difficulty"
> & {
  scoreId: string;
  gamePlayerId: string;
  scoreValue: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  maxCombo: number;
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

/**
 * 솔로 결과 저장과 경기 완료를 하나의 DB 트랜잭션으로 처리한다.
 * 점수 INSERT나 경기 UPDATE 중 하나라도 실패하면 두 변경을 모두 취소한다.
 */
export const completeSoloGameWithScore = async (
  authenticatedUserId: string,
  input: CompleteSoloGameInput,
): Promise<CompletedSoloGame> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const contextResult = await client.query<SoloGameCompletionContext>(
      `
        SELECT
          gs.id,
          gs.beatmap_id AS "beatmapId",
          gs.mode,
          gs.status,
          gp.id AS "gamePlayerId",
          gp.user_id AS "userId"
        FROM game_sessions AS gs
        JOIN game_players AS gp
          ON gp.game_session_id = gs.id
        WHERE gs.id = $1
          AND gp.id = $2
        FOR UPDATE OF gs
      `,
      [input.gameSessionId, input.gamePlayerId],
    );

    const context = contextResult.rows[0];

    if (context === undefined || context.mode !== "solo") {
      throw new SoloGameNotFoundError();
    }

    if (context.userId !== authenticatedUserId) {
      throw new SoloGameCompletionForbiddenError();
    }

    if (context.status !== "playing") {
      throw new SoloGameNotPlayingError();
    }

    const scoreResult = await client.query<Score>(
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

    const score = scoreResult.rows[0];

    if (score === undefined) {
      throw new Error("Inserted score was not returned");
    }

    const gameSessionResult = await client.query<GameSession>(
      `
        UPDATE game_sessions
        SET
          status = 'completed',
          ended_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status = 'playing'
        RETURNING
          id,
          beatmap_id AS "beatmapId",
          mode,
          status
      `,
      [input.gameSessionId],
    );

    const gameSession = gameSessionResult.rows[0];

    if (gameSession === undefined) {
      throw new SoloGameNotPlayingError();
    }

    await client.query("COMMIT");

    return {
      gameSession,
      score,
    };
  } catch (error: unknown) {
    await client.query("ROLLBACK");

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
  } finally {
    client.release();
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

export const findSoloSavedResult = async (
  userId: string,
  gameSessionId: string,
): Promise<SoloSavedResult | undefined> => {
  const result = await pool.query<SoloSavedResultRow>(
    `
      SELECT
        gs.id AS "gameSessionId",
        so.title AS "songTitle",
        b.difficulty,
        sc.id AS "scoreId",
        gp.id AS "gamePlayerId",
        sc.score AS "scoreValue",
        sc.perfect_count AS "perfectCount",
        sc.great_count AS "greatCount",
        sc.good_count AS "goodCount",
        sc.miss_count AS "missCount",
        sc.max_combo AS "maxCombo"
      FROM game_sessions AS gs
      JOIN game_players AS gp ON gp.game_session_id = gs.id
      JOIN scores AS sc ON sc.game_player_id = gp.id
      JOIN beatmaps AS b ON b.id = gs.beatmap_id
      JOIN songs AS so ON so.id = b.song_id
      WHERE gs.id = $1
        AND gp.user_id = $2
        AND gs.mode = 'solo'
        AND gs.status = 'completed'
    `,
    [gameSessionId, userId],
  );

  const row = result.rows[0];
  if (row === undefined) {
    return undefined;
  }

  return {
    gameSessionId: row.gameSessionId,
    songTitle: row.songTitle,
    difficulty: row.difficulty,
    score: {
      id: row.scoreId,
      gamePlayerId: row.gamePlayerId,
      score: row.scoreValue,
      perfectCount: row.perfectCount,
      greatCount: row.greatCount,
      goodCount: row.goodCount,
      missCount: row.missCount,
      maxCombo: row.maxCombo,
    },
  };
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
