import { pool } from "../db.js";
import type { Song } from "../domain/song.js";

// Repository는 PostgreSQL에 SQL을 실행하고 그 결과를 애플리케이션 데이터로 반환한다.
export const findAllSongs = async (): Promise<Song[]> => {
  const result = await pool.query<Song>(`
    SELECT id, title
    FROM songs
    ORDER BY id
  `);

  return result.rows;
};

export const findSongById = async (
  songId: string,
): Promise<Song | undefined> => {
  const result = await pool.query<Song>(
    `
      SELECT id, title
      FROM songs
      WHERE id = $1
    `,
    [songId],
  );

  // 곡이 없는 상황을 어떤 HTTP 응답으로 바꿀지는 Repository가 결정하지 않는다.
  return result.rows[0];
};
