import { pool } from "../db.js";

// 브라우저가 보낸 채보 ID를 믿지 않고 DB에 실제 존재하는지 확인한다.
export const beatmapExists = async (beatmapId: string): Promise<boolean> => {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM beatmaps WHERE id = $1) AS "exists"`,
    [beatmapId],
  );

  return result.rows[0]?.exists ?? false;
};
