-- 운영 환경에서 게임 선택 화면과 플레이에 필요한 최소 카탈로그를 준비한다.
-- 여러 번 실행해도 같은 곡과 채보가 중복 생성되지 않는 멱등 Seed다.

WITH seeded_song AS (
  INSERT INTO songs (
    title,
    audio_url
  )
  VALUES (
    '로보티컬 뽕짝 리듬',
    '/audio/ppongjjak_rhythm_original_v2.mp3'
  )
  ON CONFLICT (audio_url)
  DO UPDATE SET
    title = EXCLUDED.title
  RETURNING id
)
INSERT INTO beatmaps (
  song_id,
  difficulty,
  level,
  note_count,
  duration_ms
)
SELECT
  id,
  'normal',
  1,
  180,
  60000
FROM seeded_song
ON CONFLICT (song_id, difficulty)
DO UPDATE SET
  level = EXCLUDED.level,
  note_count = EXCLUDED.note_count,
  duration_ms = EXCLUDED.duration_ms;
