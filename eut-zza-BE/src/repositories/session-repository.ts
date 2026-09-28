import { pool } from "../db.js";
import type { CreateSessionInput } from "../domain/session.js";
import type { User } from "../domain/user.js";

export const createSession = async (
  input: CreateSessionInput,
): Promise<void> => {
  await pool.query(
    `
      INSERT INTO auth_sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [input.userId, input.tokenHash, input.expiresAt],
  );
};

export const findUserBySessionTokenHash = async (
  tokenHash: string,
): Promise<User | undefined> => {
  const result = await pool.query<User>(
    `
      SELECT
        u.id,
        u.email
      FROM auth_sessions AS session
      JOIN users AS u
        ON u.id = session.user_id
      WHERE session.token_hash = $1
        AND session.expires_at > CURRENT_TIMESTAMP
    `,
    [tokenHash],
  );

  return result.rows[0];
};

export const deleteSessionByTokenHash = async (
  tokenHash: string,
): Promise<void> => {
  await pool.query(
    `
      DELETE FROM auth_sessions
      WHERE token_hash = $1
    `,
    [tokenHash],
  );
};
