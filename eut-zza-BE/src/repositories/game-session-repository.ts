import { DatabaseError } from "pg";
import { pool } from "../db.js";
import {
  BeatmapNotFoundError,
  type GamePlayer,
  type GameSession,
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
