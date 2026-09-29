import { pool } from "../db.js";
import type { Difficulty } from "../domain/beatmap.js";
import type { Song } from "../domain/song.js";

type SongBeatmapRow = {
  songId: string;
  title: string;
  audioUrl: string;
  beatmapId: string | null;
  difficulty: Difficulty | null;
  level: number | null;
  noteCount: number | null;
};

const mapSongRows = (rows: SongBeatmapRow[]): Song[] => {
  const songsById = new Map<string, Song>();

  for (const row of rows) {
    let song = songsById.get(row.songId);

    if (song === undefined) {
      song = {
        id: row.songId,
        title: row.title,
        audioUrl: row.audioUrl,
        beatmaps: [],
      };

      songsById.set(row.songId, song);
    }

    // LEFT JOIN이므로 채보가 없는 곡에서는 beatmap 관련 값이 null이다.
    if (
      row.beatmapId !== null &&
      row.difficulty !== null &&
      row.level !== null &&
      row.noteCount !== null
    ) {
      song.beatmaps.push({
        id: row.beatmapId,
        difficulty: row.difficulty,
        level: row.level,
        noteCount: row.noteCount,
      });
    }
  }

  return [...songsById.values()];
};

// Repository는 PostgreSQL에 SQL을 실행하고 그 결과를 애플리케이션 데이터로 반환한다.
export const findAllSongs = async (): Promise<Song[]> => {
  const result = await pool.query<SongBeatmapRow>(`
    SELECT
      s.id AS "songId",
      s.title,
      s.audio_url AS "audioUrl",
      b.id AS "beatmapId",
      b.difficulty,
      b.level,
      b.note_count AS "noteCount"
    FROM songs AS s
    LEFT JOIN beatmaps AS b
      ON b.song_id = s.id
    ORDER BY
      s.id,
      CASE b.difficulty
        WHEN 'easy' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'hard' THEN 3
        ELSE 4
      END
  `);

  return mapSongRows(result.rows);
};

export const findSongById = async (
  songId: string,
): Promise<Song | undefined> => {
  const result = await pool.query<SongBeatmapRow>(
    `
      SELECT
        s.id AS "songId",
        s.title,
        s.audio_url AS "audioUrl",
        b.id AS "beatmapId",
        b.difficulty,
        b.level,
        b.note_count AS "noteCount"
      FROM songs AS s
      LEFT JOIN beatmaps AS b
        ON b.song_id = s.id
      WHERE s.id = $1
      ORDER BY
        CASE b.difficulty
          WHEN 'easy' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'hard' THEN 3
          ELSE 4
        END
    `,
    [songId],
  );

  // 곡이 없는 상황을 어떤 HTTP 응답으로 바꿀지는 Repository가 결정하지 않는다.
  return mapSongRows(result.rows)[0];
};
