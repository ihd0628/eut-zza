import { DatabaseError } from "pg";
import { pool } from "../db.js";
import {
  BeatmapNotFoundError,
  type GamePlayer,
  type GameSession,
  type StartedMultiplayerGame,
  type StartedSoloGame,
} from "../domain/game-session.js";

/**
 * 솔로 경기와 참가 정보를 하나의 트랜잭션으로 생성한다.
 *
 * 두 INSERT 중 하나라도 실패하면 둘 다 저장되지 않아야 한다.
 * 그래야 참가자가 없는 경기나 경기가 없는 참가 정보가 남지 않는다.
 */
export const createSoloGame = async (
  userId: string,
  beatmapId: string,
): Promise<StartedSoloGame> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const gameSessionResult = await client.query<GameSession>(
      `
        INSERT INTO game_sessions (
          beatmap_id,
          mode,
          status,
          started_at
        )
        VALUES ($1, 'solo', 'playing', CURRENT_TIMESTAMP)
        RETURNING
          id,
          beatmap_id AS "beatmapId",
          mode,
          status
      `,
      [beatmapId],
    );

    const gameSession = gameSessionResult.rows[0];

    if (gameSession === undefined) {
      throw new Error("Inserted game session was not returned");
    }

    const gamePlayerResult = await client.query<GamePlayer>(
      `
        INSERT INTO game_players (game_session_id, user_id)
        VALUES ($1, $2)
        RETURNING
          id,
          game_session_id AS "gameSessionId",
          user_id AS "userId"
      `,
      [gameSession.id, userId],
    );

    const gamePlayer = gamePlayerResult.rows[0];

    if (gamePlayer === undefined) {
      throw new Error("Inserted game player was not returned");
    }

    await client.query("COMMIT");

    return {
      gameSession,
      gamePlayer,
    };
  } catch (error: unknown) {
    await client.query("ROLLBACK");

    if (
      error instanceof DatabaseError &&
      error.code === "23503" &&
      error.constraint === "game_sessions_beatmap_id_fkey"
    ) {
      throw new BeatmapNotFoundError();
    }

    throw error;
  } finally {
    client.release();
  }
};

/**
 * 하나의 멀티플레이 경기와 참가자 전원의 game_player를 한 트랜잭션에서 만든다.
 * 일부 참가자만 저장된 경기는 존재하면 안 되므로 어느 INSERT든 실패하면 전부 되돌린다.
 */
export const createMultiplayerGame = async (
  userIds: readonly string[],
  beatmapId: string,
  startAtServerMs: number,
): Promise<StartedMultiplayerGame> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const gameSessionResult = await client.query<GameSession>(
      `
        INSERT INTO game_sessions (
          beatmap_id,
          mode,
          status,
          started_at
        )
        VALUES ($1, 'multiplayer', 'playing', $2)
        RETURNING
          id,
          beatmap_id AS "beatmapId",
          mode,
          status
      `,
      [beatmapId, new Date(startAtServerMs)],
    );

    const gameSession = gameSessionResult.rows[0];
    if (gameSession === undefined) {
      throw new Error("Inserted multiplayer game session was not returned");
    }

    const gamePlayers: GamePlayer[] = [];

    // 순서대로 INSERT해 Room의 참가자 순서와 반환 배열의 순서를 일치시킨다.
    for (const userId of userIds) {
      const gamePlayerResult = await client.query<GamePlayer>(
        `
          INSERT INTO game_players (game_session_id, user_id)
          VALUES ($1, $2)
          RETURNING
            id,
            game_session_id AS "gameSessionId",
            user_id AS "userId"
        `,
        [gameSession.id, userId],
      );

      const gamePlayer = gamePlayerResult.rows[0];
      if (gamePlayer === undefined) {
        throw new Error("Inserted multiplayer game player was not returned");
      }

      gamePlayers.push(gamePlayer);
    }

    await client.query("COMMIT");
    return { gameSession, gamePlayers, startAtServerMs };
  } catch (error: unknown) {
    await client.query("ROLLBACK");

    if (
      error instanceof DatabaseError &&
      error.code === "23503" &&
      error.constraint === "game_sessions_beatmap_id_fkey"
    ) {
      throw new BeatmapNotFoundError();
    }

    throw error;
  } finally {
    client.release();
  }
};
