# POST /scores: 점수 저장과 DB 오류의 HTTP 응답 변환

[Week 4 목차](./README.md) · [앞 문서: DB 연결과 파라미터](./node-postgres-connection-and-parameters.md)

> 학습 기록: 2026년 9월 20~21일.
> 아래 성공·실패 결과는 사용자가 실행해서 공유한 HTTP 응답과 당시 코드 기준이다.
> 문서 작성 과정에서 INSERT를 다시 실행하지 않았다.

## 1. 이번 API가 저장하는 단위

`POST /scores`는 한 사용자의 한 경기 참가에 대한 최종 결과를 저장한다.
요청의 `gamePlayerId`는 `users.id`나 `game_sessions.id`가 아니라
`game_players.id`다.

```text
game_players.id = 6
  → 어떤 경기의 어떤 참가자인지 식별
  → scores.game_player_id = 6으로 그 참가자의 결과 저장
```

한 경기에는 여러 참가자가 있고, 참가자마다 결과가 한 개씩 생길 수 있다.
현재 DB의 `UNIQUE (game_player_id)`는 동일 참가자의 결과를 중복 저장하지
못하게 한다. 경기 전체에 점수 행을 하나만 허용하는 제약은 아니다.

테이블 구조는 [스키마와 관계](./schema-and-relations.md)에 정리했다.

## 2. JSON 입력과 런타임 검증

현재 코드의 타입과 스키마다.

```ts
type CreateScoreRequestBody = {
  gamePlayerId: string;
  score: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  maxCombo: number;
};

type Score = CreateScoreRequestBody & {
  id: string;
};

const nonNegativeIntegerSchema = {
  type: "integer",
  minimum: 0,
  maximum: 2_147_483_647,
} as const;

const createScoreBodySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "gamePlayerId", "score", "perfectCount", "greatCount",
    "goodCount", "missCount", "maxCombo",
  ],
  properties: {
    gamePlayerId: {
      type: "string",
      pattern: "^[1-9][0-9]*$",
      maxLength: 18,
    },
    score: nonNegativeIntegerSchema,
    perfectCount: nonNegativeIntegerSchema,
    greatCount: nonNegativeIntegerSchema,
    goodCount: nonNegativeIntegerSchema,
    missCount: nonNegativeIntegerSchema,
    maxCombo: nonNegativeIntegerSchema,
  },
} as const;
```

TypeScript 타입은 개발할 때 사용한다. 외부 JSON 요청이 타입에 맞는지 검사하는
것은 Fastify의 `schema.body`다. 점수와 판정 개수는 현재 DB의 `INTEGER`
컬럼에 맞추어 0~2147483647로 제한했다. ID의 18자리 제한은
[앞 문서의 입력 검증 설명](./node-postgres-connection-and-parameters.md)을 참고한다.

형식에 맞는 `gamePlayerId`라고 해서 실제 참가자가 존재한다는 보장은 없다.
이 관계는 DB의 FK 제약이 검사한다. 이미 결과가 있는지는 UNIQUE가 검사한다.

## 3. 최종 구현 코드

다음은 [`src/fastify-server.ts`](../../src/fastify-server.ts)의 `/scores` 구현이다.
기존 `server`, `pool`, 위 타입과 스키마가 선언된 파일에서 사용하는 코드다.

```ts
import { DatabaseError } from "pg";

server.post<{ Body: CreateScoreRequestBody }>(
  "/scores",
  { schema: { body: createScoreBodySchema } },
  async (request, reply) => {
    const body = request.body;

    try {
      const result = await pool.query<Score>(
        `
          INSERT INTO scores (
            game_player_id,
            score,
            perfect_count,
            great_count,
            good_count,
            miss_count,
            max_combo
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            id,
            game_player_id AS "gamePlayerId",
            score,
            perfect_count AS "perfectCount",
            great_count AS "greatCount",
            good_count AS "goodCount",
            miss_count AS "missCount",
            max_combo AS "maxCombo"
        `,
        [
          body.gamePlayerId,
          body.score,
          body.perfectCount,
          body.greatCount,
          body.goodCount,
          body.missCount,
          body.maxCombo,
        ],
      );

      return reply.code(201).send({ score: result.rows[0] });
    } catch (error: unknown) {
      if (
        error instanceof DatabaseError &&
        error.code === "23505" &&
        error.constraint === "scores_game_player_id_key"
      ) {
        return reply.code(409).send({
          error: "Score already exists for this game player",
        });
      }

      if (
        error instanceof DatabaseError &&
        error.code === "23503" &&
        error.constraint === "scores_game_player_id_fkey"
      ) {
        return reply.code(404).send({ error: "Game player not found" });
      }

      throw error;
    }
  },
);
```

`INSERT`의 컬럼 순서와 전달할 값 배열의 순서를 맞춰야 한다.

| SQL 파라미터 | 배열 값 | 저장 컬럼 |
| --- | --- | --- |
| `$1` | `body.gamePlayerId` | `game_player_id` |
| `$2` | `body.score` | `score` |
| `$3` | `body.perfectCount` | `perfect_count` |
| `$4` | `body.greatCount` | `great_count` |
| `$5` | `body.goodCount` | `good_count` |
| `$6` | `body.missCount` | `miss_count` |
| `$7` | `body.maxCombo` | `max_combo` |

`RETURNING`은 저장한 행의 값을 같은 SQL의 결과로 받게 한다. 그래서 별도의
SELECT 없이 자동 생성된 `id`도 `result.rows[0]`에서 꺼낼 수 있다.
[PostgreSQL RETURNING 설명](https://www.postgresql.org/docs/18/dml-returning.html)

`AS "gamePlayerId"`는 결과 컬럼의 이름을 바꾼다. DB 컬럼명을 변경하지 않는다.
큰따옴표는 camelCase의 대소문자를 보존한다. 따옴표 없이 `AS gamePlayerId`라고
쓰면 PostgreSQL의 식별자 규칙에 따라 `gameplayerid`로 처리된다.

## 4. 실제 성공 요청과 DB 저장 결과

아래는 **당시 첫 저장에 사용한 요청**이다. 이미 저장된 참가자 `6`으로
다시 보내면 다음 절의 `409`가 나온다. 성공 실험을 반복하려면 새 경기 참가자의
실제 ID를 사용해야 한다. 예전 결과를 삭제하거나 ID가 동일하다고 가정하지 않는다.

```bash
curl -i \
  -X POST \
  http://127.0.0.1:3001/scores \
  -H 'Content-Type: application/json' \
  --data '{
    "gamePlayerId":"6",
    "score":990000,
    "perfectCount":3,
    "greatCount":1,
    "goodCount":0,
    "missCount":0,
    "maxCombo":4
  }'
```

처음에는 `201 Created`와 다음 Body를 확인했다.

```json
{
  "score": {
    "id": "5",
    "gamePlayerId": "6",
    "score": 990000,
    "perfectCount": 3,
    "greatCount": 1,
    "goodCount": 0,
    "missCount": 0,
    "maxCombo": 4
  }
}
```

다음 SELECT로 DB에도 해당 행이 존재함을 확인했다.

```sql
SELECT id, game_player_id, score,
       perfect_count, great_count, good_count, miss_count, max_combo
FROM scores
WHERE game_player_id = 6;
```

```text
id | game_player_id | score  | perfect_count | great_count | good_count | miss_count | max_combo
5  | 6              | 990000 | 3             | 1           | 0          | 0          | 4
```

이 점수는 SQL/API 실험용 데이터다. 게임 엔진의 점수 계산식이나 실제 플레이를
검증한 기록은 아니다. 당시 경기·참가자는 psql로 준비했고 이 API는 결과만 저장했다.

## 5. 처음에는 왜 둘 다 500이었는가

try/catch를 추가하기 전에 다음 두 요청을 실행했다.

| 입력 | PostgreSQL 오류 | 당시 HTTP 응답 |
| --- | --- | --- |
| 참가자 `6`의 결과 재전송 | `23505`, `scores_game_player_id_key` | `500 Internal Server Error` |
| 참가자 `99999`의 결과 전송 | `23503`, `scores_game_player_id_fkey` | `500 Internal Server Error` |

서버가 PostgreSQL의 오류를 업무 의미에 맞는 HTTP 응답으로 변환하지 않았기 때문이다.

```text
PostgreSQL이 INSERT를 제약 위반으로 거절
  → pg가 해당 쿼리의 Promise를 reject
  → await 지점에서 오류 발생
  → 처리하지 않은 오류가 async 핸들러 밖으로 전달
  → Fastify의 기본 오류 처리에서 500 응답
```

응답 Body에는 `code: "23505"` 또는 `code: "23503"`와 내부 제약 이름이 들어 있었다.
`23505`는 HTTP 상태 코드가 아니라 PostgreSQL의 SQLSTATE다.

## 6. 오류 코드와 제약 이름을 함께 검사하는 이유

`catch (error: unknown)`의 값은 DB 연결 오류나 다른 JS 오류일 수도 있다.
`instanceof DatabaseError`는 pg가 제공하는 DB 오류 클래스인지 확인한다.

- `error.code`: UNIQUE 위반인지, FK 위반인지 등의 오류 종류.
- `error.constraint`: 어떤 제약이 위반됐는지.

같은 `23505`라도 다른 UNIQUE 제약 위반일 수 있으므로, 특정 제약까지 확인한 뒤
“이 참가자의 결과가 이미 있다”는 응답을 만든다. PostgreSQL은 오류 메시지
문자열을 파싱하기보다 SQLSTATE와 별도 필드를 사용하는 것을 권장한다.
[PostgreSQL 오류 코드 설명](https://www.postgresql.org/docs/18/errcodes-appendix.html)

최종 코드를 적용하고 같은 요청들을 보낸 결과:

| 입력 | 확인한 HTTP 상태 | 확인한 Body |
| --- | --- | --- |
| `gamePlayerId: "6"` | `409 Conflict` | `{"error":"Score already exists for this game player"}` |
| `gamePlayerId: "99999"` | `404 Not Found` | `{"error":"Game player not found"}` |

이 매핑은 이 API에서 정한 정책이다. 모든 FK 위반이 무조건 HTTP 404라는
일반 규칙은 아니다. 두 응답에서는 이제 내부 테이블·제약 이름을 노출하지 않는다.

마지막 `throw error`는 예상하지 못한 오류를 Fastify에 다시 전달한다.
따라서 **모든 오류 응답의 내부 정보가 가려졌다는 뜻은 아니다.** 예상 밖 오류에
대한 공통 로깅·응답 정책은 현재 구현에 추가되어 있지 않다.

## 7. 사전 조회와 DB 제약의 역할

“이미 있나 SELECT하고 없으면 INSERT하면 되지 않을까?”라는 방식만으로는
동시 요청을 막을 수 없다. 두 요청이 동시에 “없다”를 확인할 수도 있다.

현재는 DB의 UNIQUE가 최종적으로 중복 저장을 거절하고, 서버가 그 실패를
409로 표현한다. 이는 중복 저장 방지다. 재시도 요청에 예전 성공 응답을
그대로 돌려주는 완전한 멱등 처리까지 구현한 것은 아니다.

## 8. 현재 트랜잭션 범위와 후속 학습

현재 `/scores`는 INSERT 한 문장이다. 명시적 BEGIN이 없어도 PostgreSQL은
이 문장을 트랜잭션으로 처리한다. 오류가 났다고 결과 행의 일부만 저장되지는 않는다.
다만 identity의 번호 발급은 실패해도 되돌아가지 않을 수 있다.
[이전 트랜잭션 학습](./transactions-and-acid.md)

경기 상태 변경과 여러 참가자의 결과 저장을 한 묶음으로 처리하는 API는 아직 없다.
향후 그런 작업을 묶을 때는 `pool.connect()`로 확보한 **같은 client**에서
BEGIN, 각 SQL, COMMIT/ROLLBACK을 실행하고 연결을 반환해야 한다.
여러 `pool.query()` 호출이 같은 연결을 사용한다고 가정하면 안 된다.
[node-postgres 트랜잭션 설명](https://node-postgres.com/features/transactions)

현재 점수 저장 API는 요청자의 본인 여부, 경기 완료 여부, 판정 합계와 실제
노트 수의 일치 여부까지 검사하지 않는다. 실제 인증·인가는 Week 5에서 연결한다.
이번 확인 범위는 DB 저장, 입력 형식 스키마, 두 제약 위반의 HTTP 변환이다.

다음: [랭킹과 사용자 경기 기록 API](./ranking-and-history-apis.md)
