# Week 4 — PostgreSQL: SQL, 인덱스, 트랜잭션과 동시성

> 로드맵 기간: 2026년 9월 15일 ~ 9월 21일
>
> 기록 범위: 2026년 9월 21일까지 학습한 내용
>
> 실험 환경: PostgreSQL 18.6 (Homebrew), 데이터베이스 `eut_zza`

## 이번 주의 학습 방향

ORM 없이 SQL을 직접 작성하고, PostgreSQL이 데이터를 저장·조회하고
동시 접근을 조정하는 방식을 실험했다.

프론트엔드 관점에서 특히 구분해야 할 것은 다음과 같다.

- JavaScript 객체와 관계형 테이블의 저장 구조는 같을 필요가 없다.
- SQL의 JOIN은 테이블을 영구적으로 합치는 작업이 아니다.
- DB 인덱스는 원본 배열을 정렬하는 것과 다르다.
- DB Buffer의 cache hit는 API 응답이나 SELECT 결과를 재사용한다는 뜻이 아니다.
- 트랜잭션은 SQL 실행을 COMMIT 시점까지 미루는 기능이 아니다.
- MVCC를 사용한다고 행 잠금이 사라지는 것은 아니다.
- `pool.query()`의 두 번째 인자 배열은 입력값이며, `result.rows`는 출력 행 배열이다.
- DB 제약 위반과 HTTP 상태 코드는 서버 코드에서 의미에 맞게 연결한다.

이 문서는 [루트 로드맵의 Week 4](../../../road-map.md)를 보조하는 학습 기록이다.
문서 작성 자체로 주간 완료 조건을 모두 달성했다고 판단하지 않는다.

## 읽는 순서

| 순서 | 문서 | 주요 내용 |
| --- | --- | --- |
| 1 | [psql과 기본 SQL](./psql-and-basic-sql.md) | 서버와 클라이언트, 세미콜론, CRUD, identity의 빈 번호 |
| 2 | [테이블 설계와 관계](./schema-and-relations.md) | 실제 6개 테이블의 DDL, 제약 조건, 경기·참가·결과를 분리한 이유 |
| 3 | [JOIN, 경기 기록, 랭킹](./joins-history-and-ranking.md) | JOIN의 범위, GROUP BY, 사용자별 MAX와 COUNT |
| 4 | [B-tree, EXPLAIN, Buffer](./indexes-explain-and-buffers.md) | 작은 테이블의 Seq Scan, 10만 행 실험, local hit, 실행 계획 읽기 |
| 5 | [복합 인덱스 순서 실험](./composite-index-lab.md) | `(beatmap_id, score DESC)`와 역순 비교, 541·12·39의 의미 |
| 6 | [트랜잭션과 ACID](./transactions-and-acid.md) | COMMIT/ROLLBACK, 중간 오류, 실패 상태, ACID |
| 7 | [MVCC, 격리 수준, 행 잠금](./mvcc-isolation-and-row-locks.md) | 두 psql 연결의 조회·수정, Read Committed와 Repeatable Read |
| 8 | [Node.js DB 연결과 파라미터](./node-postgres-connection-and-parameters.md) | Pool, 환경변수, await, `$1`과 값 배열, 결과 타입, ID 검증 |
| 9 | [점수 저장과 DB 오류 처리](./score-api-and-database-errors.md) | INSERT RETURNING, UNIQUE/FK, Promise rejection, 201·409·404 |
| 10 | [랭킹과 경기 기록 API](./ranking-and-history-apis.md) | 실제 라우트와 SQL, JOIN 한 줄씩 읽기, 집계와 정렬, curl 결과 |

## 기록을 읽거나 다시 실행할 때

- 결과는 대화에서 확인한 사용자 실행 로그를 기준으로 기록했다.
  일부 긴 로그는 핵심 줄만 발췌했다.
- 표에 기록한 실행 시간과 Buffer 수는 해당 실행의 관찰값이다.
  모든 환경에서 같은 수치가 나오거나 같은 속도 배율을 보장하지 않는다.
- 복습을 위해 재구성한 예제는 그렇게 표시했다. 모든 SQL 블록이 하나의
  연속 실행 스크립트인 것은 아니다.
- `CREATE TABLE`은 이미 테이블이 있으면 실패한다. 기존 테이블을 지우고
  처음부터 다시 만들라는 뜻이 아니다.
- `TEMP TABLE`은 만든 연결에서만 사용할 수 있다. 연결을 종료하면 사라진다.
- 두 연결 실험의 `public.transaction_shared_lab`은 일반 테이블이다.
  연결을 종료해도 남으며, 기존 게임 테이블과 분리된 실험용 데이터다.
- 예시 ID는 당시 데이터의 ID다. 재실행할 때 identity가 같은 ID를
  발급한다고 가정하지 말고 SELECT 또는 RETURNING 결과를 확인한다.
- 두 창 실험은 A/B 실행 순서를 지킨다. 끝나면 각 창의 트랜잭션을
  COMMIT 또는 ROLLBACK으로 마무리한다.

## 지금까지 확인한 범위

- `users`, `songs`, `beatmaps`, `game_sessions`, `game_players`, `scores` 생성.
- CRUD, JOIN, GROUP BY, ORDER BY, LIMIT을 사용하는 조회 실행.
- UNIQUE, FK, CHECK 위반이 거절되는 모습 관찰.
- 단일·복합 인덱스 생성 전후의 EXPLAIN ANALYZE 비교.
- 명시적 트랜잭션의 확정·취소와 오류 후 처리.
- 두 연결에서 같은 행을 수정할 때 대기하는 현상.
- Repeatable Read에서 같은 트랜잭션의 조회 기준이 유지되는 현상.
- pg Pool로 Fastify와 PostgreSQL 연결, 곡 목록·단일 곡 조회.
- HTTP 요청으로 점수 저장 후 DB 행 확인, 중복·없는 참가자 오류 응답 처리.
- 곡·난이도별 랭킹과 사용자별 최신 경기 기록의 HTTP 응답 확인.

9월 20일 최초 문서화 시 DDL을 읽기 전용으로 확인하고 JOIN 조회 3개는 EXPLAIN으로
실행 계획 생성까지 확인했다. 이후 API 실습에서 사용자가 테스트 경기·참가자를
추가하고 HTTP로 결과를 저장했다. 따라서 초기 SQL 문서와 최신 API 문서의
행 개수가 다르다. 각 문서의 관찰 시점을 기준으로 읽는다.

9월 21일 API 리뷰에서는 타입 검사·린트·빌드를 통과했다. 새 문서 작성 자체는
코드·데이터 변경이나 HTTP 저장 요청 재실행을 하지 않는다. 과거 동시성 실험이나
성능 측정 결과를 모두 다시 검증했다는 뜻도 아니다.

## 현재 구현 상태와 마무리

[`src/db.ts`](../../src/db.ts)의 Pool을
[`src/fastify-server.ts`](../../src/fastify-server.ts)에서 사용한다.
실행 방법과 `.env` 설정은 [백엔드 README](../../README.md)를 참고한다.

| API | 확인한 동작 |
| --- | --- |
| `GET /songs` | DB 목록 조회, 200 |
| `GET /songs/:id` | 단일 곡 조회 200, 없는 곡 404, 잘못된 ID 400 |
| `POST /scores` | 결과 저장 201, 중복 409, 없는 참가자 404 |
| `GET /songs/:id/ranking?difficulty=normal` | 집계 조회 200, 잘못된 난이도 400, 없는 곡 404 |
| `GET /users/:id/scores` | 최신 기록 조회 200, 없는 사용자 404, 잘못된 ID 400 |

Week 4의 세 API는 기본 구현과 위 동작 확인을 마쳤다. 빈 기록 응답, 모든 입력
경계값, 동시 HTTP 요청을 통한 저장 등까지 검증했다고 확대해서 해석하지 않는다.

현재 점수 API는 INSERT 한 문장이며, 여러 참가자 저장과 경기 상태 변경을 묶는
트랜잭션 API는 구현하지 않았다. 트랜잭션·격리·행 잠금은 앞의 psql 실험에서 다뤘다.
인증 API는 여전히 학습용 mock이고, 점수 제출자의 본인 여부도 아직 확인하지 않는다.

2026년 9월 21일 학습 내용과 확인한 실행 결과를 주간 완료 조건과 대조하고,
루트 로드맵의 Week 4 완료 조건 6개를 모두 체크했다. Week 4는 여기까지
마무리하며, 실제 인증과 서버 계층 구조 확장은 Week 5에서 진행한다.
