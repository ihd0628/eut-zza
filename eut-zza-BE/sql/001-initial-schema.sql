-- eut-zza의 초기 제품 DB 구조를 빈 PostgreSQL 데이터베이스에 생성한다.
-- 한 번 적용한 DB에는 다시 실행하지 않는다.

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE songs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE beatmaps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  song_id BIGINT NOT NULL REFERENCES songs(id),
  difficulty TEXT NOT NULL
    CHECK (difficulty IN ('easy', 'normal', 'hard')),
  level SMALLINT NOT NULL
    CHECK (level BETWEEN 1 AND 100),
  note_count INTEGER NOT NULL
    CHECK (note_count >= 0),
  duration_ms INTEGER NOT NULL
    CHECK (duration_ms > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (song_id, difficulty)
);

CREATE TABLE game_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  beatmap_id BIGINT NOT NULL REFERENCES beatmaps(id),
  mode TEXT NOT NULL
    CHECK (mode IN ('solo', 'multiplayer')),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'playing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE TABLE game_players (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_session_id BIGINT NOT NULL REFERENCES game_sessions(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  result_status TEXT NOT NULL DEFAULT 'playing'
    CHECK (result_status IN ('playing', 'submitted', 'disconnected', 'timed_out')),
  finished_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_session_id, user_id)
);

CREATE TABLE scores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_player_id BIGINT NOT NULL UNIQUE REFERENCES game_players(id),
  score INTEGER NOT NULL
    CHECK (score >= 0),
  perfect_count INTEGER NOT NULL
    CHECK (perfect_count >= 0),
  great_count INTEGER NOT NULL
    CHECK (great_count >= 0),
  good_count INTEGER NOT NULL
    CHECK (good_count >= 0),
  miss_count INTEGER NOT NULL
    CHECK (miss_count >= 0),
  max_combo INTEGER NOT NULL
    CHECK (max_combo >= 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 한 사용자의 세션을 조회하거나 한꺼번에 제거할 때 사용한다.
CREATE INDEX auth_sessions_user_id_idx
ON auth_sessions (user_id);

-- 만료된 세션을 주기적으로 정리할 때 사용한다.
CREATE INDEX auth_sessions_expires_at_idx
ON auth_sessions (expires_at);
