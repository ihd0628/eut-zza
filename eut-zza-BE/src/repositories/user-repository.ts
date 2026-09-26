import { pool } from "../db.js";
import type { User } from "../domain/user.js";

export const findUserById = async (
  userId: string,
): Promise<User | undefined> => {
  const result = await pool.query<User>(
    `
      SELECT id, email
      FROM users
      WHERE id = $1
    `,
    [userId],
  );

  return result.rows[0];
};
