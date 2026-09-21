# Fastify에서 PostgreSQL 연결하기: Pool, await, $1, 결과 배열

[Week 4 목차](./README.md)

> 학습 기록: 2026년 9월 20~21일.
> 당시 작성한 코드와 대화에서 확인한 실행 결과를 기준으로 정리했다.

## 1. psql에서 실행하던 SQL을 HTTP 요청에 연결했다

이전에는 터미널의 psql이 PostgreSQL에 SQL을 보냈다. 이번에는 Node.js의
`pg` 패키지(node-postgres)가 그 역할을 맡는다. SQL 실행은 PostgreSQL이 한다.

```text
curl 또는 브라우저
  → HTTP 요청: 127.0.0.1:3001
  → Fastify의 라우트 핸들러
  → pg 드라이버: SQL과 파라미터 전송
  → PostgreSQL: 127.0.0.1:5432에서 SQL 실행
  → pg가 결과를 JavaScript 객체로 변환
  → Fastify가 JSON HTTP 응답 전송
```

클라이언트가 사용하는 HTTP 연결과 Node.js가 사용하는 DB 연결은 별개다.
`pg`는 ORM이 아니며, 지금은 SQL을 직접 작성하고 있다.

관련 파일:

- [`src/db.ts`](../../src/db.ts): DB 연결 Pool 생성.
- [`src/db-check.ts`](../../src/db-check.ts): 연결 확인용 일회성 실행 파일.
- [`src/fastify-server.ts`](../../src/fastify-server.ts): HTTP 요청에서 SQL 호출.
- [백엔드 README](../../README.md): 실행 방법.

## 2. 환경변수와 연결 확인

학습 당시 `.env`의 접속 설정은 다음과 같았다. `PGUSER`는 환경에 따라 다르다.

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=eut_zza
PGUSER=seunghoon
```

`PGDATABASE`는 접속할 DB 이름, `PGUSER`는 PostgreSQL role이다.
Node.js의 `--env-file=.env` 옵션으로 환경변수를 읽고, pg가 `PGHOST` 등의
값을 사용한다. `.env`는 Git에서 제외하고 `.env.example`을 공유한다.
필요한 환경에서는 `.env`에 `PGPASSWORD`도 설정한다.
[node-postgres 연결 설정](https://node-postgres.com/features/connecting)

`eut-zza-BE` 폴더에서 실행한다.

```bash
npm run db:check
npm run dev:fastify
```

첫 명령은 아래 SQL로 접속 대상만 확인한 뒤 연결을 닫는다. 두 번째 명령이
Fastify 서버를 실행한다. 연결 확인이 테이블 생성까지 대신해 주지는 않는다.

```sql
SELECT
  current_database() AS database,
  current_user AS db_user;
```

확인한 결과는 `database: eut_zza`, `db_user: seunghoon`이었다.

## 3. Pool은 무엇을 재사용하는가

`src/db.ts`의 핵심 코드다.

```ts
import pg from "pg";

export const pool = new pg.Pool({
  max: 5,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error: Error) => {
  console.error("[DB] 대기 중인 연결에서 오류 발생", error);
});
```

Pool은 DB 연결을 빌려주고 재사용한다. SELECT 결과를 캐싱하는 객체는 아니다.

- `max: 5`: 이 Pool의 연결 수 상한이다. 생성 즉시 5개를 모두 여는 뜻은 아니다.
- `connectionTimeoutMillis`: 연결을 얻을 때의 대기 제한이다. SQL 실행 시간 제한과는 다르다.
- `pool.query()`: 한 SQL 실행에 사용할 연결을 관리해 준다.
- `pool.on("error")`: 사용하지 않고 대기 중인 연결에서 발생하는 오류를 받는다.
  실행 중인 쿼리의 Promise rejection을 모두 대신 처리하는 것은 아니다.
- `pool.end()`: Pool을 종료한다. 일회성 `db:check` 종료 시 사용하며,
  API 요청이 끝날 때마다 호출하지 않는다.

[node-postgres Pool 설명](https://node-postgres.com/features/pooling),
[Pool 설정](https://node-postgres.com/apis/pool)

## 4. await와 result.rows

작성한 곡 목록 핸들러다. `pool`과 `server`는 기존 파일에서 생성한 객체다.

```ts
type Song = {
  id: string;
  title: string;
};

server.get("/songs", async () => {
  const result = await pool.query<Song>(`
    SELECT id, title
    FROM songs
    ORDER BY id
  `);

  return { songs: result.rows };
});
```

1. 요청이 오면 핸들러가 실행되고 `pool.query()`를 호출한다.
2. `query()`가 반환한 Promise를 `await`한다. 기다리는 동안 이 핸들러의
   실행은 중단되지만 Node.js 메인 스레드 전체를 점유하지는 않는다.
3. PostgreSQL의 결과를 pg가 처리하고 Promise가 fulfilled되면,
   `await` 이후 코드가 microtask를 통해 이어진다.
4. `result.rows`를 반환하면 Fastify가 JSON 응답을 만든다.
5. Promise가 rejected되면 `await` 지점에서 오류가 발생하며 `catch`로 처리할 수 있다.

`<Song>`은 TypeScript에 결과 행의 예상 타입을 알려준다. SQL이 정말 그 컬럼을
반환하는지 런타임에 검증하거나, DB 타입을 원하는 JS 타입으로 바꿔 주지는 않는다.

`result`에는 쿼리 정보도 들어 있고, `result.rows`가 결과 행들의 배열이다.

```ts
result.rows;
// [{ id: "1", title: "로보티컬 뽕짝 리듬" }]

result.rows[0];
// { id: "1", title: "로보티컬 뽕짝 리듬" }
```

행이 없으면 `rows`는 `[]`, `rows[0]`은 `undefined`다.
이는 조회 성공 후 결과가 없다는 뜻이며 SQL 오류와는 다르다.
[node-postgres Result 설명](https://node-postgres.com/apis/result)

실행한 요청과 응답:

```bash
curl -i http://127.0.0.1:3001/songs
```

```json
{"songs":[{"id":"1","title":"로보티컬 뽕짝 리듬"}]}
```

상태는 `200 OK`였다. 기존 mock의 `"song-1"` 대신 DB의 ID `"1"`이 나왔다.

## 5. “배열을 전달한 적이 없는데 $1은 어떤 배열을 보는가?”

실제로 작성한 단일 곡 조회는 다음과 같다.

```ts
const result = await pool.query<Song>(
  `SELECT id, title FROM songs WHERE id = $1`,
  [request.params.id],
);
```

여기서 `[request.params.id]`가 바로 호출할 때 생성해서 전달하는 배열이다.
`GET /songs/1` 요청에서는 다음과 같이 연결된다.

```ts
request.params.id;       // "1"
[request.params.id];     // ["1"]

// 같은 호출을 변수로 펼쳐 쓰면:
const sql = "SELECT id, title FROM songs WHERE id = $1";
const values = [request.params.id];
const result = await pool.query<Song>(sql, values);
```

| 위치 | 역할 |
| --- | --- |
| `query()` 첫 번째 인자 | 실행할 SQL 문장 |
| `query()` 두 번째 인자 | SQL에 전달할 값들의 JS 배열 |
| `$1` | `values[0]`에 대응하는 SQL 파라미터 |
| `$2` | `values[1]`에 대응하는 SQL 파라미터 |
| `result.rows` | SQL 실행 후 돌려받은 결과 행 배열 |

**입력 배열 `values`와 출력 배열 `result.rows`는 서로 다른 배열이다.**
HTTP 클라이언트가 배열을 전송해야 하는 것도 아니다. 여기서는 URL에서 꺼낸
문자열을 서버 코드가 배열로 감싸서 pg에 전달했다.

`$1`이 JS 배열에 직접 접근하는 것은 아니다. pg가 SQL과 값들을 분리해 전달하고,
PostgreSQL이 번호에 맞는 파라미터 값으로 처리한다. SQL 문자열에 JS의
문자열 치환을 수행한다고 이해하지 않는다.

이 방식을 parameterized query라고 한다. 입력값이 SQL 문법으로 해석되는
SQL Injection을 방지하기 위한 방식이다. 단, 값이 유효한 ID인지 검증하거나
사용자 권한을 확인하는 역할까지 하지는 않는다. 테이블명·컬럼명도 `$1`로
대체할 수 없다.
[node-postgres 파라미터 설명](https://node-postgres.com/features/queries)

## 6. ID가 JSON에서 문자열인 이유

현재 ID 컬럼은 PostgreSQL `BIGINT`다. JS `number`가 모든 BIGINT 값을 정확히
표현할 수는 없으므로, 현재 pg의 기본 파서 설정에서는 문자열로 받는다.
실제 응답의 `"id":"1"`은 이 설정에 따른 정상 결과다.

JS의 `bigint`와 PostgreSQL의 `BIGINT`는 이름이 비슷하지만 서로 다른 환경의
타입이다. `pool.query<Song>()`라고 적어서 문자열로 바뀐 것도 아니다.
[node-postgres 타입 처리](https://node-postgres.com/features/types)

## 7. 입력 형식 검사와 존재 여부 검사

현재 경로 ID 스키마는 다음과 같다.

```ts
const songParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: {
      type: "string",
      pattern: "^[1-9][0-9]*$",
      maxLength: 18,
    },
  },
} as const;
```

라우트의 `schema.params`에 연결하면 Fastify가 핸들러 실행 전에 검사한다.
`pattern`은 0과 선행 0을 제외한 양의 정수 문자열을 요구한다.

`maxLength: 18`은 이 API에서 정한 보수적인 제한이다. PostgreSQL BIGINT가
18자리까지만 저장한다는 뜻이 아니다. 양의 최댓값은 `9223372036854775807`로
19자리이며, 현재 API는 그중 일부 유효한 값도 거절한다.

| 실제 요청 | 확인한 상태 | 어느 단계에서 결정됐는가 |
| --- | --- | --- |
| `/songs/1` | `200` | 검증 후 DB에서 행을 찾음 |
| `/songs/999999` | `404` | 검증 통과, DB 결과가 비어 있음 |
| `/songs/abc` | `400` | Fastify가 형식 검증에서 거절 |

`404`는 핸들러에서 `result.rows[0] === undefined`를 확인해 직접 반환했다.
조회 결과가 비었다고 PostgreSQL이 HTTP 404를 보내는 것은 아니다.

또한 `additionalProperties: false`만 보고 추가 필드가 언제나 400이라고
단정하면 안 된다. Fastify의 기본 Ajv 설정은 추가 필드를 제거할 수 있고,
타입 변환도 수행할 수 있다. 이번에 실제 확인한 것은 위 ID 검증 사례다.
[Fastify 검증 설명](https://fastify.dev/docs/v5.12.x/Reference/Validation-and-Serialization/)

다음: [점수 저장과 DB 오류를 HTTP 응답으로 변환하기](./score-api-and-database-errors.md)
