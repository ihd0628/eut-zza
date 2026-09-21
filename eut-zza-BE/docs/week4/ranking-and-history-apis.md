# JOIN 쿼리를 랭킹·사용자 경기 기록 API에 연결하기

[Week 4 목차](./README.md) · [앞 문서: 점수 저장과 오류 처리](./score-api-and-database-errors.md)

> 2026년 9월 21일의 코드와 사용자 실행 로그를 기준으로 기록했다.
> 기존 [JOIN 학습 문서](./joins-history-and-ranking.md)는 psql 실험 당시의
> 결과다. 이 문서에는 HTTP로 결과를 추가한 이후의 데이터가 나온다.

## 1. 두 API가 답하는 질문

| API | 질문 | 결과 한 행의 의미 |
| --- | --- | --- |
| `/songs/:id/ranking?difficulty=normal` | 이 곡·난이도에서 사용자별 최고 점수는? | 사용자 한 명의 집계 |
| `/users/:id/scores` | 이 사용자가 최근에 어떤 경기를 했는가? | 플레이 결과 한 개 |

랭킹은 GROUP BY로 여러 플레이 결과를 사용자별로 묶는다.
경기 기록은 플레이별 행을 유지하므로 GROUP BY나 MAX가 필요 없다.

## 2. 랭킹 요청의 두 입력

```bash
curl -i 'http://127.0.0.1:3001/songs/1/ranking?difficulty=normal'
```

```ts
request.params.id;        // "1": 경로의 :id
request.query.difficulty; // "normal": ? 뒤의 쿼리 문자열
```

두 값은 다음 배열로 SQL에 전달한다.

```ts
[request.params.id, request.query.difficulty]
// ["1", "normal"]
// $1 = "1", $2 = "normal"
```

곡 ID는 기존 `songParamsSchema`, 난이도는 아래 스키마로 검사한다.
`Difficulty` 타입만 선언해도 외부 요청을 검증해 준다는 뜻은 아니다.

```ts
type Difficulty = "easy" | "normal" | "hard";
type SongRankingQuerystring = { difficulty: Difficulty };

type RankingEntry = {
  userId: string;
  email: string;
  bestScore: number;
  playCount: number;
};

const songRankingQuerystringSchema = {
  type: "object",
  additionalProperties: false,
  required: ["difficulty"],
  properties: {
    difficulty: {
      type: "string",
      enum: ["easy", "normal", "hard"],
    },
  },
} as const;
```

`schema.params`와 `schema.querystring`에 각각 연결한다. 검증 위치는
[Fastify 공식 문서](https://fastify.dev/docs/v5.12.x/Reference/Validation-and-Serialization/)에서 확인할 수 있다.

## 3. 실제 랭킹 핸들러

아래는 [`src/fastify-server.ts`](../../src/fastify-server.ts)의 해당 부분이다.
앞에서 정의한 타입·스키마와 기존 `server`, `pool`을 사용하는 코드다.

```ts
server.get<{
  Params: SongParams;
  Querystring: SongRankingQuerystring;
}>(
  "/songs/:id/ranking",
  {
    schema: {
      params: songParamsSchema,
      querystring: songRankingQuerystringSchema,
    },
  },
  async (request, reply) => {
    const songResult = await pool.query<Pick<Song, "id">>(
      "SELECT id FROM songs WHERE id = $1",
      [request.params.id],
    );

    if (songResult.rows[0] === undefined) {
      return reply.code(404).send({ error: "Song Not Found" });
    }

    const rankingResult = await pool.query<RankingEntry>(
      `
        SELECT
          u.id AS "userId",
          u.email,
          MAX(sc.score) AS "bestScore",
          COUNT(*)::integer AS "playCount"
        FROM scores AS sc
        JOIN game_players AS gp
          ON gp.id = sc.game_player_id
        JOIN users AS u
          ON u.id = gp.user_id
        JOIN game_sessions AS gs
          ON gs.id = gp.game_session_id
        JOIN beatmaps AS b
          ON b.id = gs.beatmap_id
        WHERE b.song_id = $1
          AND b.difficulty = $2
          AND gs.status = 'completed'
        GROUP BY u.id, u.email
        ORDER BY MAX(sc.score) DESC, u.id ASC
        LIMIT 10
      `,
      [request.params.id, request.query.difficulty],
    );

    return {
      songId: request.params.id,
      difficulty: request.query.difficulty,
      ranking: rankingResult.rows,
    };
  },
);
```

먼저 곡의 존재를 확인하는 이유는 없는 곡과 결과가 아직 없는 곡을 구분하기 위해서다.
`Pick<Song, "id">`는 `Song` 타입 중 `id`만 가진 결과 행 타입을 뜻한다.

## 4. JOIN을 한 줄씩 읽기

이 쿼리가 따라가는 관계다.

```text
scores (sc)
  └─ game_player_id → game_players (gp)
                       ├─ user_id → users (u)
                       └─ game_session_id → game_sessions (gs)
                                               └─ beatmap_id → beatmaps (b)
```

| SQL 부분 | 의미 |
| --- | --- |
| `FROM scores AS sc` | 점수 테이블을 기준으로 조회하며 이번 쿼리에서 `sc`라고 부름 |
| `JOIN game_players AS gp` | 점수가 어느 경기 참가자의 결과인지 연결 |
| `ON gp.id = sc.game_player_id` | 점수의 참가자 ID와 참가 행의 PK가 같은 행을 연결 |
| `JOIN users AS u` | 사용자 정보를 가져올 테이블을 연결 |
| `ON u.id = gp.user_id` | 참가 행이 가리키는 사용자를 연결 |
| `JOIN game_sessions AS gs` | 어느 경기에서 얻은 점수인지 연결 |
| `ON gs.id = gp.game_session_id` | 참가 행이 가리키는 경기를 연결 |
| `JOIN beatmaps AS b` | 경기에서 사용한 채보를 연결 |
| `ON b.id = gs.beatmap_id` | 경기의 채보 ID와 채보 PK가 같은 행을 연결 |

이때 JOIN은 INNER JOIN이다. 상대 행이 연결 조건에 맞는 경우만 결과에 남는다.
원래 테이블들을 영구적으로 합치거나 다음 쿼리의 설정을 바꾸지 않는다.

랭킹 쿼리는 `beatmaps.song_id`로 곡을 구분할 수 있고 곡 제목을 출력하지 않으므로
`songs`를 JOIN하지 않았다. `users`는 출력에 이메일이 필요해서 연결했다.

## 5. WHERE에서 어떤 행을 남기는가

```sql
WHERE b.song_id = $1
  AND b.difficulty = $2
  AND gs.status = 'completed'
```

- 요청받은 곡의 채보여야 한다.
- 요청받은 난이도여야 한다.
- 완료된 경기여야 한다.

세 조건을 모두 만족한 점수 행만 집계 대상이다. 현재 스키마는
`UNIQUE (song_id, difficulty)`가 있으므로 같은 곡·난이도에 채보가 하나다.

곡 `1`, 난이도 `normal`의 당시 데이터를 필요한 컬럼만 펼치면 다음과 같다.

| userId | email | score |
| --- | --- | ---: |
| 1 | test@example.com | 970000 |
| 1 | test@example.com | 930000 |
| 1 | test@example.com | 990000 |
| 3 | updated@example.com | 950000 |
| 3 | updated@example.com | 980000 |

이 표는 이해를 위한 재구성이다. 중간 결과가 위 순서로 실제 저장된다는 뜻은 아니다.

## 6. GROUP BY와 SELECT에서 사용자별 결과 만들기

```sql
GROUP BY u.id, u.email
```

위 5행을 같은 사용자 ID·이메일 기준으로 묶는다.

```text
사용자 1 그룹: 970000, 930000, 990000
사용자 3 그룹: 950000, 980000
```

SELECT가 각 그룹에서 출력할 값을 지정한다.

| SELECT 부분 | 그룹에서 반환할 값 |
| --- | --- |
| `u.id AS "userId"` | 사용자 ID. 응답의 속성 이름은 `userId` |
| `u.email` | 사용자 이메일 |
| `MAX(sc.score) AS "bestScore"` | 이 그룹의 점수 중 최댓값 |
| `COUNT(*)::integer AS "playCount"` | 이 그룹의 행 개수를 INTEGER로 변환 |

`MAX`는 최고 점수 **값**을 구한다. 최고 점수를 얻은 경기의 전체 행을
자동으로 선택하지 않는다. 그 경기의 콤보까지 필요하다면 다른 쿼리가 필요하다.

`COUNT(*)`는 JOIN·WHERE를 통과한 행 수다. 현재 JOIN들은 점수 하나에 연결되는
행이 각각 하나이며, 참가자당 결과도 최대 하나이므로 여기서는 해당 조건의
저장된 플레이 결과 수로 해석할 수 있다. 모든 곡의 플레이 횟수나 결과가 아직
없는 참가 기록까지 세는 것은 아니다.

PostgreSQL의 COUNT 결과 타입은 BIGINT다. 현재 pg 설정에서 그대로 받으면
문자열이므로 `::integer`로 변환해 JS 숫자로 받았다. 이 변환에는
2147483647이라는 상한이 있다. 무제한 개수를 처리하는 일반 해법은 아니다.
[PostgreSQL 집계 함수](https://www.postgresql.org/docs/18/functions-aggregate.html)

현재 쿼리는 출력하는 사용자 ID와 이메일을 GROUP BY에 모두 명시했다.
일반적으로 그룹 키나 집계 값을 SELECT하며, PostgreSQL은 PK로 결정되는
컬럼처럼 함수적 종속성이 인정되는 경우의 예외도 지원한다.
[PostgreSQL GROUP BY 설명](https://www.postgresql.org/docs/18/sql-select.html#SQL-GROUPBY)

## 7. 정렬과 상위 10명

```sql
ORDER BY MAX(sc.score) DESC, u.id ASC
LIMIT 10
```

최고 점수 내림차순으로 정렬하고, 동점이면 사용자 ID 오름차순으로 순서를 정한다.
그 뒤 앞의 10개 사용자 행을 반환한다. 공동 순위를 계산하는 기능은 아니다.

이 쿼리를 이해하기 위한 논리적 순서는 다음과 같다.

```text
FROM / JOIN → WHERE → GROUP BY / 집계 → SELECT → ORDER BY → LIMIT
```

이 순서는 **SQL의 의미를 이해하기 위한 모델**이다. PostgreSQL이 반드시 모든
행을 JOIN한 후 필터링한다는 뜻은 아니다. Planner가 필터를 먼저 적용하거나
JOIN 순서를 바꿀 수 있다. 실제 실행 방식은 [EXPLAIN 학습](./indexes-explain-and-buffers.md)에서 확인한다.

## 8. 실제 랭킹 API 결과

앞의 정상 요청은 `200 OK`로 다음 Body를 반환했다.

```json
{
  "songId": "1",
  "difficulty": "normal",
  "ranking": [
    {"userId":"1","email":"test@example.com","bestScore":990000,"playCount":3},
    {"userId":"3","email":"updated@example.com","bestScore":980000,"playCount":2}
  ]
}
```

오류 확인 요청:

```bash
curl -i 'http://127.0.0.1:3001/songs/1/ranking?difficulty=expert'
curl -i 'http://127.0.0.1:3001/songs/99999/ranking?difficulty=normal'
```

| 요청 | 실제 상태와 원인 |
| --- | --- |
| `difficulty=expert` | `400`, Fastify의 enum 검증 실패 |
| 곡 ID `99999` | `404`, `{"error":"Song Not Found"}` |

곡은 있지만 조건에 맞는 결과가 없으면 현재 코드상 `200`과 `ranking: []`가 된다.
해당 난이도의 채보가 아직 없는 경우도 별도로 404로 구분하지 않는다.
이 빈 배열 경우는 위 실행 로그로 직접 확인한 사례와 구분한다.

## 9. 사용자 경기 기록의 실제 핸들러

```ts
type UserParams = { id: string };
type UserScoreEntry = {
  scoreId: string;
  gameSessionId: string;
  songTitle: string;
  difficulty: Difficulty;
  score: number;
  maxCombo: number;
};

const userParamsSchema = songParamsSchema;

server.get<{ Params: UserParams }>(
  "/users/:id/scores",
  { schema: { params: userParamsSchema } },
  async (request, reply) => {
    const userResult = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1",
      [request.params.id],
    );

    if (userResult.rows[0] === undefined) {
      return reply.code(404).send({ error: "User Not Found" });
    }

    const scoresResult = await pool.query<UserScoreEntry>(
      `
        SELECT
          sc.id AS "scoreId",
          gs.id AS "gameSessionId",
          so.title AS "songTitle",
          b.difficulty,
          sc.score,
          sc.max_combo AS "maxCombo"
        FROM scores AS sc
        JOIN game_players AS gp ON gp.id = sc.game_player_id
        JOIN game_sessions AS gs ON gs.id = gp.game_session_id
        JOIN beatmaps AS b ON b.id = gs.beatmap_id
        JOIN songs AS so ON so.id = b.song_id
        WHERE gp.user_id = $1
          AND gs.status = 'completed'
        ORDER BY gs.ended_at DESC NULLS LAST, sc.id DESC
        LIMIT 20
      `,
      [request.params.id],
    );

    return { userId: request.params.id, scores: scoresResult.rows };
  },
);
```

곡 ID와 사용자 ID의 형식 규칙이 같아 기존 스키마 객체를 재사용했다.
기록 쿼리는 `gp.user_id`로 사용자 범위를 제한하며, 사용자 이메일은 반환하지
않으므로 `users`를 JOIN하지 않는다. 대신 곡 제목을 반환하기 위해 `songs`를 연결한다.

`ORDER BY gs.ended_at DESC NULLS LAST, sc.id DESC`는 최근 종료 경기부터
정렬한다. 종료 시간이 NULL인 행은 뒤로 보내고, 종료 시간이 같은 행은 점수 기록
ID 내림차순으로 정렬한다. 점수 크기순이 아니다.
[PostgreSQL 정렬 설명](https://www.postgresql.org/docs/18/queries-order.html)

`LIMIT 20`은 최대 20개까지 응답한다는 뜻이다. 뒤의 기록을 삭제하지 않으며,
현재는 다음 페이지를 조회하는 기능이 없다.

## 10. 실제 경기 기록 조회 결과

```bash
curl -i 'http://127.0.0.1:3001/users/1/scores'
curl -i 'http://127.0.0.1:3001/users/3/scores'
curl -i 'http://127.0.0.1:3001/users/99999/scores'
curl -i 'http://127.0.0.1:3001/users/abc/scores'
```

첫 두 요청은 `200 OK`였으며, 응답 구조는 `{ userId, scores: [...] }`였다.
각 결과에는 `songTitle: "로보티컬 뽕짝 리듬"`, `difficulty: "normal"`,
`maxCombo: 4`도 들어 있었다. 나머지 필드와 응답 순서는 다음과 같다.

| userId | 응답 순서 | scoreId | gameSessionId | score |
| --- | ---: | --- | --- | ---: |
| 1 | 1 | 5 | 3 | 990000 |
| 1 | 2 | 3 | 2 | 930000 |
| 1 | 3 | 1 | 1 | 970000 |
| 3 | 1 | 4 | 2 | 980000 |
| 3 | 2 | 2 | 1 | 950000 |

- 사용자 `99999`: `404`, `{"error":"User Not Found"}`.
- 사용자 `abc`: `400`, `params/id`의 pattern 검증 실패.

존재하지만 기록이 없는 사용자는 코드상 `200`과 `scores: []`가 된다.
위 사용자 1·3은 모두 기록이 있으므로 빈 기록 응답을 직접 검증한 사례는 아니다.

## 11. 이번 확인 범위

사용자가 위 HTTP 요청을 실행했고, 코드 리뷰에서 타입 검사·린트·빌드도 통과했다.
최신 기록순과 랭킹순이 서로 다르다는 점, 형식 오류와 존재하지 않는 대상을
각각 400·404로 처리한다는 점을 확인했다.

현재 인증은 mock이며, 본인 기록 접근 정책이나 공개 랭킹의 표시 이름 정책은
아직 연결하지 않았다. 존재 확인과 목록 조회는 별도 SQL 호출이므로 하나의
고정된 스냅샷으로 묶은 트랜잭션 조회도 아니다. 이 문서는 현재 구현의 확인
범위를 기록하며 Week 5의 인증·서버 구조 학습까지 완료했다고 보지는 않는다.
