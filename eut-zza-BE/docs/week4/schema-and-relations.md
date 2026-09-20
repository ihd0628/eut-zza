# 테이블 설계와 관계: 경기·참가자·결과를 나눈 이유

[Week 4 목차](./README.md)

## 1. 현재 데이터 모델

| 테이블 | 한 행이 뜻하는 것 |
| --- | --- |
| `users` | 사용자 한 명 |
| `songs` | 곡 한 개와 오디오 경로 |
| `beatmaps` | 한 곡의 특정 난이도 채보 |
| `game_sessions` | 특정 채보로 진행하는 경기 한 판 |
| `game_players` | 특정 경기에 특정 사용자가 참가한 사실 |
| `scores` | 그 참가자의 최종 경기 결과 |

관계는 다음과 같다. `1:N`은 하나에 여러 개가 연결될 수 있다는 뜻이다.

```text
songs         1 ── N beatmaps
beatmaps      1 ── N game_sessions
game_sessions 1 ── N game_players N ── 1 users
game_players  1 ── 0 또는 1 scores
```

`game_players`에 참가자를 행으로 추가하므로 사용자마다 별도의 컬럼을
만드는 구조가 아니다. 참가자 수에 유연한 설계지만, 실제 허용 인원과 방
운영 규칙은 이후 애플리케이션에서 구현해야 한다.

## 2. 실제 생성한 테이블 정의

아래 DDL은 문서 작성 시 로컬 DB의 정의와 대조한 학습용 스키마다.
이미 테이블이 있는 DB에 다시 실행하거나 기존 테이블을 삭제하라는 뜻은 아니다.
자동 migration 스크립트도 아니다.

### users

```sql
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### songs

```sql
CREATE TABLE songs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

오디오는 DB에 MP3 바이트로 저장한 것이 아니라 아래와 같은 경로를 저장했다.

```sql
INSERT INTO songs (title, audio_url)
VALUES (
  '로보티컬 뽕짝 리듬',
  '/audio/ppongjjak_rhythm_original_v2.mp3'
)
RETURNING *;
```

이 경로는 현재 프론트엔드의 public/audio 파일을 가리키는 학습용 값이다.
백엔드 오디오 전송이나 파일 업로드 구현까지 끝났다는 뜻은 아니다.

### beatmaps

```sql
CREATE TABLE beatmaps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  song_id BIGINT NOT NULL REFERENCES songs(id),
  difficulty TEXT NOT NULL
    CHECK (difficulty IN ('easy', 'normal', 'hard')),
  level SMALLINT NOT NULL
    CHECK (level BETWEEN 1 AND 100),
  note_count INTEGER NOT NULL
    CHECK (note_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (song_id, difficulty)
);
```

`UNIQUE (song_id, difficulty)`는 두 값을 묶은 조합의 중복을 금지한다.
다른 곡이 같은 `normal` 난이도를 가지는 것은 허용한다.
현재 테이블은 채보의 메타데이터만 담고 있으며, 개별 노트 배열의 저장까지
구현한 것은 아니다.

### game_sessions

```sql
CREATE TABLE game_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  beatmap_id BIGINT NOT NULL REFERENCES beatmaps(id),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'playing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
```

### game_players

```sql
CREATE TABLE game_players (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_session_id BIGINT NOT NULL REFERENCES game_sessions(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_session_id, user_id)
);
```

같은 사용자가 같은 경기에 두 번 참가한 행은 만들 수 없다.
같은 사용자가 다른 경기에 다시 참가하는 것은 가능하다.

### scores

```sql
CREATE TABLE scores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_player_id BIGINT NOT NULL UNIQUE REFERENCES game_players(id),
  score INTEGER NOT NULL CHECK (score >= 0),
  perfect_count INTEGER NOT NULL CHECK (perfect_count >= 0),
  great_count INTEGER NOT NULL CHECK (great_count >= 0),
  good_count INTEGER NOT NULL CHECK (good_count >= 0),
  miss_count INTEGER NOT NULL CHECK (miss_count >= 0),
  max_combo INTEGER NOT NULL CHECK (max_combo >= 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`game_player_id`의 UNIQUE로 참가 한 건에 최종 결과를 최대 한 개만 연결한다.
참가 행을 만들었다고 결과 행이 자동으로 생기는 것은 아니다.

현재 제약 조건만으로 판정 수의 합, 실제 노트 수와의 일치, 종료 후 변경 금지,
본인 점수 제출 등의 모든 게임 규칙이 보장되지는 않는다.
이는 이후 서버 로직·검증·트랜잭션에서 다룰 내용이다.

## 3. PK, FK, UNIQUE, CHECK

| 제약 | 역할 | 예 |
| --- | --- | --- |
| Primary Key | 행 식별, 중복·NULL 금지 | `users.id` |
| Foreign Key | 참조 대상의 존재 등 참조 무결성 유지 | `beatmaps.song_id → songs.id` |
| UNIQUE | 값 또는 값 조합의 중복 금지 | 이메일, `(game_session_id, user_id)` |
| CHECK | 행에 저장할 값에 조건 적용 | 점수는 0 이상 |

이번 FK에는 별도 삭제 정책을 지정하지 않았으므로 기본 동작을 사용한다.
참조 중인 부모를 지우면 자식까지 자동으로 삭제되는 것이 아니다.
[PostgreSQL 제약 조건 설명](https://www.postgresql.org/docs/18/ddl-constraints.html)

### 실제 FK 오류 실험

존재하지 않는 곡을 참조하는 채보를 넣었다.

```sql
INSERT INTO beatmaps (song_id, difficulty, level, note_count)
VALUES (999, 'easy', 1, 4);
```

```text
ERROR: insert or update on table "beatmaps" violates foreign key constraint
Key (song_id)=(999) is not present in table "songs".
```

반대로 이미 채보가 참조하는 곡을 삭제하려 했다.

```sql
DELETE FROM songs WHERE id = 1;
```

```text
ERROR: update or delete on table "songs" violates foreign key constraint
Key (id)=(1) is still referenced from table "beatmaps".
```

두 오류는 DB가 참조 관계를 보호한 결과다. 삭제 실험을 다시 실행할 때는
현재 데이터와 참조 상태가 바뀌었을 수 있으므로 그대로 실행하지 않는다.

## 4. 한 경기 안에 유저와 점수를 JSON으로 넣으면 안 되는가?

불가능한 것은 아니다. PostgreSQL은 JSONB 같은 타입도 지원한다.
다만 이번 프로젝트에서는 다음 책임을 분리하기로 했다.

- 경기의 채보·시작·종료·상태는 경기 자체의 정보다.
- 누가 참가했는지는 참가 정보다. 결과가 나오기 전에도 존재한다.
- 최종 점수와 판정 개수는 경기 후에 생기는 참가자별 결과다.

이 구조에서는 참가자의 존재, 중복 참가, 결과 중복 등을 제약 조건으로
표현하고, 경기 기록이나 사용자 랭킹을 관계형 쿼리로 조회할 수 있다.
사용자 이메일을 매 경기마다 복사하는 대신 `user_id`를 참조한다.

여기서 두 가지를 과장하면 안 된다.

1. 참가 정보와 결과를 반드시 별도 테이블로 만들어야만 정상적인 설계인 것은 아니다.
   `game_players`에 nullable 결과 컬럼을 두는 선택도 가능하다.
2. 실시간 멀티플레이 자체가 모든 상태를 DB에 영구 저장해야 한다는 뜻은 아니다.
   방 상태와 진행 중 점수의 실시간 관리, 최종 결과의 영구 기록은 별도 결정이다.

사용자는 최종 결과 기록을 남기기로 했고, 현재 분리 설계를 유지하기로 했다.
JSONB에 중첩해서 저장하는 선택과 그 갱신 단위에 관한 참고:
[PostgreSQL JSON 데이터 설계](https://www.postgresql.org/docs/18/datatype-json.html#JSON-DOC-DESIGN)

## 5. 방과 경기 한 판은 같지 않다

하나의 방에서 곡을 세 번 플레이하면 경기 기록은 세 개가 될 수 있다.
`game_sessions`는 경기 한 판을 나타내며, WebSocket 연결이나 대기실 객체와
동일한 개념이 아니다. 현재 스키마만으로 실시간 방 기능을 구현한 것은 아니다.

참가자 수를 늘리는 것과 게임 규칙상 최대 인원을 정하는 것도 별개다.
실시간 방 생성·입장·준비·동시 시작은 후속 주차에서 다룬다.

## 6. API 응답 모양과 DB 저장 모양은 달라도 된다

여러 테이블에 저장해도 서버가 JOIN한 결과를 조합해 다음 형태로 응답할 수 있다.
아래는 응답 모양을 설명하기 위한 예시이며 아직 구현된 API가 아니다.

```json
{
  "gameSessionId": "1",
  "players": [
    { "userId": "1", "score": 970000 },
    { "userId": "3", "score": 950000 }
  ]
}
```

프론트엔드에 편한 JSON을 만들기 위해 DB도 반드시 같은 중첩 구조여야
하는 것은 아니다. 반대로 필요한 과거 이름을 보존하는 등 별도의 요구가
생기면 의도적인 값 복사를 검토할 수 있다.
