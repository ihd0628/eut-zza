import type { PoolClient } from "pg";
import { pool } from "../db.js";
import {
  MultiplayerGameCompletionForbiddenError,
  MultiplayerGameNotFoundError,
  MultiplayerGameNotPlayingError,
  MultiplayerResultConflictError,
  type CompleteMultiplayerGameInput,
  type GameSessionStatus,
  type MultiplayerResultState,
  type MultiplayerResultStatus,
} from "../domain/game-session.js";
import type { Score } from "../domain/score.js";
import { rankMultiplayerResults } from "../services/multiplayer-ranking.js";

type MultiplayerContextRow = {
  mode: "solo" | "multiplayer";
  status: GameSessionStatus;
  userId: string;
  resultStatus: MultiplayerResultStatus;
};

type MultiplayerResultRow = {
  gameSessionStatus: GameSessionStatus;
  userId: string;
  email: string;
  gamePlayerId: string;
  resultStatus: MultiplayerResultStatus;
  score: number | null;
  perfectCount: number | null;
  greatCount: number | null;
  goodCount: number | null;
  missCount: number | null;
  maxCombo: number | null;
};

const scoreMatchesInput = (
  score: Score,
  input: CompleteMultiplayerGameInput,
): boolean => (
  score.gamePlayerId === input.gamePlayerId &&
  score.score === input.score &&
  score.perfectCount === input.perfectCount &&
  score.greatCount === input.greatCount &&
  score.goodCount === input.goodCount &&
  score.missCount === input.missCount &&
  score.maxCombo === input.maxCombo
);

const findMultiplayerResultStateWithClient = async (
  client: PoolClient,
  gameSessionId: string,
): Promise<MultiplayerResultState> => {
  const result = await client.query<MultiplayerResultRow>(
    `
      SELECT
        gs.status AS "gameSessionStatus",
        gp.user_id AS "userId",
        u.email,
        gp.id AS "gamePlayerId",
        gp.result_status AS "resultStatus",
        sc.score,
        sc.perfect_count AS "perfectCount",
        sc.great_count AS "greatCount",
        sc.good_count AS "goodCount",
        sc.miss_count AS "missCount",
        sc.max_combo AS "maxCombo"
      FROM game_sessions AS gs
      JOIN game_players AS gp
        ON gp.game_session_id = gs.id
      JOIN users AS u
        ON u.id = gp.user_id
      LEFT JOIN scores AS sc
        ON sc.game_player_id = gp.id
      WHERE gs.id = $1
        AND gs.mode = 'multiplayer'
      ORDER BY gp.id ASC
    `,
    [gameSessionId],
  );

  const firstRow = result.rows[0];
  if (firstRow === undefined) throw new MultiplayerGameNotFoundError();

  return {
    gameSessionId,
    status: firstRow.gameSessionStatus,
    // 조회 편의를 위해 각 행에 포함한 경기 상태는 참가자 결과 DTO에는 노출하지 않는다.
    players: rankMultiplayerResults(result.rows.map((row) => ({
      userId: row.userId,
      email: row.email,
      gamePlayerId: row.gamePlayerId,
      resultStatus: row.resultStatus,
      score: row.score,
      perfectCount: row.perfectCount,
      greatCount: row.greatCount,
      goodCount: row.goodCount,
      missCount: row.missCount,
      maxCombo: row.maxCombo,
    }))),
  };
};

const completeSessionIfNoPlayerIsRunning = async (
  client: PoolClient,
  gameSessionId: string,
): Promise<void> => {
  await client.query(
    `
      UPDATE game_sessions AS gs
      SET
        status = 'completed',
        ended_at = CURRENT_TIMESTAMP
      WHERE gs.id = $1
        AND gs.mode = 'multiplayer'
        AND gs.status = 'playing'
        AND NOT EXISTS (
          SELECT 1
          FROM game_players AS gp
          WHERE gp.game_session_id = gs.id
            AND gp.result_status = 'playing'
        )
    `,
    [gameSessionId],
  );
};

export const submitMultiplayerResult = async (
  authenticatedUserId: string,
  input: CompleteMultiplayerGameInput,
): Promise<MultiplayerResultState> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const contextResult = await client.query<MultiplayerContextRow>(
      `
        SELECT
          gs.mode,
          gs.status,
          gp.user_id AS "userId",
          gp.result_status AS "resultStatus"
        FROM game_sessions AS gs
        JOIN game_players AS gp
          ON gp.game_session_id = gs.id
        WHERE gs.id = $1
          AND gp.id = $2
        FOR UPDATE OF gs, gp
      `,
      [input.gameSessionId, input.gamePlayerId],
    );
    const context = contextResult.rows[0];

    if (context === undefined || context.mode !== "multiplayer") {
      throw new MultiplayerGameNotFoundError();
    }
    if (context.userId !== authenticatedUserId) {
      throw new MultiplayerGameCompletionForbiddenError();
    }

    if (context.resultStatus === "submitted") {
      const existingResult = await client.query<Score>(
        `
          SELECT
            id,
            game_player_id AS "gamePlayerId",
            score,
            perfect_count AS "perfectCount",
            great_count AS "greatCount",
            good_count AS "goodCount",
            miss_count AS "missCount",
            max_combo AS "maxCombo"
          FROM scores
          WHERE game_player_id = $1
        `,
        [input.gamePlayerId],
      );
      const existingScore = existingResult.rows[0];
      if (existingScore === undefined || !scoreMatchesInput(existingScore, input)) {
        throw new MultiplayerResultConflictError();
      }

      const existingState = await findMultiplayerResultStateWithClient(
        client,
        input.gameSessionId,
      );
      await client.query("COMMIT");
      return existingState;
    }

    if (context.status !== "playing" || context.resultStatus !== "playing") {
      throw new MultiplayerGameNotPlayingError();
    }

    await client.query(
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
    await client.query(
      `
        UPDATE game_players
        SET
          result_status = 'submitted',
          finished_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [input.gamePlayerId],
    );
    await completeSessionIfNoPlayerIsRunning(client, input.gameSessionId);

    const state = await findMultiplayerResultStateWithClient(client, input.gameSessionId);
    await client.query("COMMIT");
    return state;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const markMultiplayerPlayerUnavailable = async (
  gameSessionId: string,
  userId: string,
  resultStatus: "disconnected" | "timed_out",
): Promise<MultiplayerResultState> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE game_players AS gp
        SET
          result_status = $3,
          finished_at = CURRENT_TIMESTAMP
        FROM game_sessions AS gs
        WHERE gs.id = $1
          AND gs.id = gp.game_session_id
          AND gs.mode = 'multiplayer'
          AND gs.status = 'playing'
          AND gp.user_id = $2
          AND gp.result_status = 'playing'
      `,
      [gameSessionId, userId, resultStatus],
    );
    await completeSessionIfNoPlayerIsRunning(client, gameSessionId);
    const state = await findMultiplayerResultStateWithClient(client, gameSessionId);
    await client.query("COMMIT");
    return state;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const expireMultiplayerGame = async (
  gameSessionId: string,
): Promise<MultiplayerResultState> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE game_players AS gp
        SET
          result_status = 'timed_out',
          finished_at = CURRENT_TIMESTAMP
        FROM game_sessions AS gs
        WHERE gs.id = $1
          AND gs.id = gp.game_session_id
          AND gs.mode = 'multiplayer'
          AND gs.status = 'playing'
          AND gp.result_status = 'playing'
      `,
      [gameSessionId],
    );
    await completeSessionIfNoPlayerIsRunning(client, gameSessionId);
    const state = await findMultiplayerResultStateWithClient(client, gameSessionId);
    await client.query("COMMIT");
    return state;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const findMultiplayerResultState = async (
  gameSessionId: string,
  authenticatedUserId: string,
): Promise<MultiplayerResultState> => {
  const client = await pool.connect();

  try {
    const state = await findMultiplayerResultStateWithClient(client, gameSessionId);
    if (!state.players.some((player) => player.userId === authenticatedUserId)) {
      throw new MultiplayerGameCompletionForbiddenError();
    }
    return state;
  } finally {
    client.release();
  }
};
