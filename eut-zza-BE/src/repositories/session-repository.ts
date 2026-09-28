import { pool } from "../db.js";
import type { CreateSessionInput } from "../domain/session.js";

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
