# eut-zza-BE

Week 3의 HTTP·Network·Node.js와 Week 4의 PostgreSQL 학습을 위한 백엔드 프로젝트다.

처음부터 Fastify를 사용하지 않고 Node.js 내장 `node:http` 모듈로 서버를
만든 뒤 같은 API를 Fastify로 다시 구현한다. 프레임워크가 대신 처리하는
HTTP 요청과 응답의 기본 구조를 비교하는 것이 목적이다.

## 실행 방법

개발 서버를 실행한다.

```bash
npm run dev
```

위 명령은 학습용 raw Node.js 서버를 `127.0.0.1:3000`에서 실행한다.
Fastify 비교 서버는 아래 DB 접속 설정에 따라 `.env`를 준비한 뒤,
별도의 터미널에서 다음 명령으로 실행한다.

```bash
npm run dev:fastify
```

Fastify 서버는 `127.0.0.1:3001`을 사용하므로 두 서버를 동시에 실행하고
같은 `/health` 응답을 비교할 수 있다.

Week 7의 자동 매칭과 랭킹 캐시를 사용하려면 `.env`의 `REDIS_URL`에서
접근 가능한 Redis 서버도 실행 중이어야 한다. Redis가 중단되어도 랭킹은
PostgreSQL 조회로 대체되고 영속 점수 저장은 유지되지만, 자동 매칭 API는
`503 Service Unavailable`을 반환한다.

```bash
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3001/health
```

다른 터미널이나 브라우저에서 다음 주소로 요청한다.

```text
http://127.0.0.1:3000/health
```

헤더까지 터미널에서 확인하려면 다음 명령을 사용한다.

```bash
curl -i http://127.0.0.1:3000/health
```

예상 Body는 다음과 같다.

```json
{
  "status": "ok",
  "service": "eut-zza-be"
}
```

존재하지 않는 경로는 `404 Not Found`를 반환한다.

```bash
curl -i http://127.0.0.1:3000/unknown
```

## PostgreSQL 접속 설정과 연결 확인

PostgreSQL 서버와 `eut_zza` 데이터베이스가 실행 가능한 상태여야 한다.
새 환경에서는 `.env.example`과 같은 내용으로 이 폴더에 `.env` 파일을 만들고,
`PGUSER`를 자신의 PostgreSQL role로 바꾼다. 기존 `.env`가 있다면 덮어쓰지 않는다.

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=eut_zza
PGUSER=seunghoon
```

현재 개발 환경에는 위 설정의 `.env`를 준비했다. `.env`는 Git에서 제외하고,
공유할 설정 예시인 `.env.example`만 추적한다. 비밀번호가 필요한 환경에서는
`.env`에 `PGPASSWORD`를 설정한다. 현재 로컬에서 비밀번호 없이 접속된다는 것은
운영 서버에서도 인증을 생략하라는 뜻이 아니다. DB 인증 설정은 변경하지 않았다.

```bash
npm run db:check
```

이 명령은 `.env`를 로드하고 `src/db-check.ts`를 실행한다.
현재 DB와 role을 SELECT로 확인한 뒤 연결을 닫는다. 테이블이나 데이터를
생성·수정하지 않으며 Fastify 서버도 시작하지 않는다.

```text
[DB] PostgreSQL 연결 성공
database: eut_zza
db_user: seunghoon
```

- `src/db.ts`: PostgreSQL 연결을 재사용하는 Pool. 요청마다 새로 만들지 않는다.
- `src/db-check.ts`: `pool.query()`와 `result.rows`를 확인하는 일회성 스크립트.
- `pg`: SQL을 DB에 보내는 드라이버이며 ORM이 아니다.
- `.env`: Node.js의 `--env-file`로 읽는다. 이미 설정된 환경변수가 있으면 그 값이 우선한다.

Fastify의 곡 목록·단일 곡 조회, 점수 저장, 랭킹·경기 기록 조회는 이제
`pool.query()`로 PostgreSQL에 연결한다. raw Node.js 학습 서버는 이전 구현을 유지한다.
여러 SQL을 한 트랜잭션으로 묶을 때는 같은 연결을 확보해서 사용해야 하며,
별도의 `pool.query()` 호출들이 항상 같은 연결을 사용한다고 가정하면 안 된다.

## 학습 문서

주차별 문서의 목차와 학습 순서는 다음 파일에서 확인한다.

- [`docs/week4/README.md`](./docs/week4/README.md): PostgreSQL, SQL, 인덱스, 트랜잭션, Fastify DB API와 실행 결과
- [`docs/week7/README.md`](./docs/week7/README.md): 네트워크 시간, Trust Boundary, Redis, 랭킹, 자동 매칭과 멱등성

Week 3의 HTTP·Network·Node.js 문서는 다음과 같다.

- [`docs/week3/README.md`](./docs/week3/README.md)
- [`docs/week3/raw-node-http-server-and-streams.md`](./docs/week3/raw-node-http-server-and-streams.md)
- [`docs/week3/fastify-rest-api.md`](./docs/week3/fastify-rest-api.md)
- [`docs/week3/cors-same-origin-and-preflight.md`](./docs/week3/cors-same-origin-and-preflight.md)
- [`docs/week3/local-url-to-http-response-and-host.md`](./docs/week3/local-url-to-http-response-and-host.md)
- [`docs/week3/https-dns-tcp-tls-reverse-proxy.md`](./docs/week3/https-dns-tcp-tls-reverse-proxy.md)
- [`docs/week3/http-cookie-authorization-and-cache.md`](./docs/week3/http-cookie-authorization-and-cache.md)

## 현재 엔드포인트

raw Node.js 서버(`3000`)와 Fastify 서버(`3001`)의 공통 경로:

```text
GET  /health
GET  /songs
GET  /songs/:id
POST /auth/signup
POST /auth/login
```

Fastify 서버에 추가한 PostgreSQL API:

```text
POST /scores
GET  /songs/:id/ranking?difficulty=normal
GET  /users/:id/scores
POST /matchmaking/join
GET  /matchmaking/status
DELETE /matchmaking
```

Fastify의 `/songs`와 `/songs/:id`도 DB를 사용한다. 입력 검증과 실제 확인한
응답은 [Week 4 API 학습 기록](./docs/week4/ranking-and-history-apis.md)에 정리했다.

`POST /auth/signup`과 `POST /auth/login`은 Request Body Stream, JSON 파싱,
런타임 검증 및 HTTP 상태 코드를 학습하기 위한 임시 구현이다. 사용자 정보를
데이터베이스에 저장하거나 Cookie·Token을 발급하는 실제 인증 기능은 아직 없다.

## 현재 확인할 개념

- `http.createServer()`는 무엇을 생성하는가?
- 서버 시작 시점이 아니라 요청이 올 때 `handleRequest()`가 실행되는 이유는 무엇인가?
- `IncomingMessage`에서 method, URL, header, body를 어떻게 얻는가?
- `IncomingMessage`가 Readable Stream인 이유는 무엇인가?
- Request Body chunk는 언제 `data` 이벤트로 전달되는가?
- Body를 모두 받으면 `await` 이후 코드는 언제 다시 실행되는가?
- `ServerResponse`에 status code, header, body를 어떻게 작성하는가?
- `response.end()`를 호출해야 하는 이유는 무엇인가?
- `server.listen()`과 TCP 포트는 어떤 관계인가?

## 아직 의도적으로 넣지 않은 것

- 비밀번호 hashing
- 실제 사용자 저장 및 인증
- Cookie, Session, JWT
- 점수 제출자의 본인 확인과 서버의 게임 결과 검증

각 기능은 기본 HTTP 흐름을 확인한 다음 로드맵 순서대로 추가한다.
