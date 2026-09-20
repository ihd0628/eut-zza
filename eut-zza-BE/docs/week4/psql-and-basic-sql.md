# psql과 기본 SQL

[Week 4 목차](./README.md)

## 1. PostgreSQL, 데이터베이스, psql은 서로 다르다

- PostgreSQL 서버: 데이터를 관리하고 SQL을 실행하는 프로그램.
- `eut_zza`: 이 서버 안에서 사용하는 데이터베이스 이름.
- `psql`: 서버에 접속해서 SQL을 보내고 결과를 보여주는 터미널 클라이언트.
- `seunghoon`: 이번 로컬 접속에서 사용한 PostgreSQL role 이름.
  GitHub 계정과는 별개다.

접속 명령은 다음과 같았다.

```bash
/opt/homebrew/opt/postgresql@18/bin/psql eut_zza
```

이 명령은 데이터베이스를 새로 만드는 명령이 아니라, 이미 존재하는 DB에
접속하는 명령이다. `psql` 종료와 PostgreSQL 서버 종료도 서로 다르다.

접속 후 확인한 SQL:

```sql
SELECT version();
SELECT current_database(), current_user;
```

확인한 결과:

```text
current_database | current_user
-----------------+-------------
eut_zza          | seunghoon
```

나중에 Node.js를 연결하면 psql 대신 Node.js의 DB 드라이버가 SQL을 보내고
결과를 받는다. PostgreSQL이 SQL을 실행한다는 점은 같다.

## 2. 세미콜론을 빼먹으면 어떻게 되는가

처음 다음과 같이 입력했다.

```text
eut_zza=# SELECT version()
eut_zza-# SELECT current_database(), current_user;
```

psql은 첫 번째 문장이 끝나지 않았다고 보고 두 줄을 하나의 SQL로 보냈다.
그래서 두 번째 SELECT 부근에서 문법 오류가 발생했다.

올바른 입력:

```sql
SELECT version();
SELECT current_database(), current_user;
```

`eut_zza-#`는 서버가 오래 걸리는 SQL을 실행 중이라는 뜻이 아니라,
현재 입력한 SQL이 아직 끝나지 않았다는 뜻이다.

기본 프롬프트에서는 다음 표시를 구분한다.

| 표시 | 의미 |
| --- | --- |
| `eut_zza=#` | 트랜잭션 블록 밖에서 새 명령 입력 대기 |
| `eut_zza-#` | 세미콜론 등 SQL 입력의 마무리를 기다림 |
| `eut_zza=*#` | 트랜잭션 블록 안 |
| `eut_zza=!#` | 실패한 트랜잭션 블록 안 |

이 표는 이번 환경의 기본 프롬프트 기준이다. 끝의 `#`/`>` 등은 접속 role과
설정에 따라 다를 수 있다. [psql 프롬프트 공식 설명](https://www.postgresql.org/docs/18/app-psql.html#APP-PSQL-PROMPTING)

## 3. psql 전용 명령

다음은 SQL이 아니라 psql이 해석하는 명령이다. 끝에 세미콜론을 붙이지 않는다.

```text
\dt          테이블 목록
\d users     users 테이블의 컬럼, 제약 조건, 인덱스
\r           아직 전송하지 않은 입력 버퍼 비우기
\?           psql 명령 도움말
\q           현재 psql 연결 종료
```

`\r`은 DB 변경을 취소하는 명령이 아니다. 입력 중인 SQL을 지우는 기능이다.
이미 실행한 트랜잭션의 취소는 `ROLLBACK`으로 한다.

## 4. 기본 CRUD

`users`의 CREATE TABLE 정의는 [테이블 설계 문서](./schema-and-relations.md)에 있다.

처음 실행한 INSERT:

```sql
INSERT INTO users (email, password_hash)
VALUES ('test@example.com', 'learning-only-placeholder-hash')
RETURNING *;
```

- INSERT INTO: 어느 테이블에 행을 추가할지 지정한다.
- 컬럼 목록과 VALUES: 어떤 컬럼에 어떤 값을 넣을지 순서대로 대응한다.
- RETURNING: 방금 추가한 행의 값을 결과로 돌려받는다.
- 생략한 `id`, `created_at`은 정의한 자동 생성·기본값을 사용한다.

`learning-only-placeholder-hash`는 실제 비밀번호 해시가 아니다.
SQL 학습용 문자열이며, 운영용 비밀번호 저장 방식으로 사용하지 않는다.

조회:

```sql
SELECT id, email, created_at
FROM users
ORDER BY id;
```

`ORDER BY`가 없으면 조회 결과의 순서를 보장하지 않는다. 현재 ID 순으로
보이더라도 앞으로도 같은 순서라는 약속이 아니다.

UPDATE와 DELETE의 문법을 복습하기 위한 별도 예제는 다음과 같다.
당시 터미널 기록의 완전한 재현이 아니라, 기존 사용자를 건드리지 않도록
재구성한 예제다. 전체 블록을 순서대로 실행하고 마지막 ROLLBACK까지 마친다.

```sql
BEGIN;

INSERT INTO users (email, password_hash)
VALUES ('crud-lab@example.com', 'learning-only-placeholder-hash')
RETURNING id, email;

UPDATE users
SET email = 'crud-lab-updated@example.com'
WHERE email = 'crud-lab@example.com'
RETURNING id, email;

SELECT id, email
FROM users
WHERE email = 'crud-lab-updated@example.com';

DELETE FROM users
WHERE email = 'crud-lab-updated@example.com'
RETURNING id, email;

ROLLBACK;
```

동일한 실험용 이메일이 이미 있으면 INSERT가 거절된다. 기존 행을 지워서
맞추지 말고 ROLLBACK 후 별도 이메일로 실험한다.

UPDATE/DELETE에 WHERE를 생략하면 대상 테이블의 모든 행이 수정·삭제 대상이
된다. 연습에서도 대상 행을 먼저 SELECT로 확인하는 습관이 필요하다.

## 5. UNIQUE 오류와 identity 번호의 빈칸

이미 존재하는 이메일을 다시 넣었을 때 다음 오류를 확인했다.

```sql
INSERT INTO users (email, password_hash)
VALUES ('test@example.com', 'another-placeholder-hash');
```

```text
ERROR: duplicate key value violates unique constraint "users_email_key"
Key (email)=(test@example.com) already exists.
```

나중에 확인한 사용자 ID는 `1`, `3`이었다. ID `2`가 없다고 데이터가
손상된 것은 아니다. identity가 사용하는 sequence의 번호는 INSERT가
나중에 실패하거나 트랜잭션이 취소되어도 되돌아가지 않을 수 있다.

따라서 다음을 구분한다.

- ID: 각 행을 식별하기 위한 값.
- 행 개수: `COUNT(*)`로 계산할 값.
- 빈 번호 없는 순번: identity가 보장하는 기능이 아님.

위 CRUD 복습을 ROLLBACK하더라도 identity 번호는 소비될 수 있다.
[PostgreSQL sequence의 트랜잭션 관련 주의점](https://www.postgresql.org/docs/18/functions-sequence.html)

## 6. 타입과 제약 조건의 역할

| 표현 | 이번 설계에서의 역할 |
| --- | --- |
| `BIGINT` | 큰 범위의 정수 ID |
| `GENERATED ALWAYS AS IDENTITY` | 일반 INSERT에서 ID 자동 생성 |
| `TEXT` | 이메일, 제목, 오디오 경로 등의 문자열 |
| `SMALLINT`, `INTEGER` | 레벨, 점수, 판정 개수 등의 정수 |
| `TIMESTAMPTZ` | 생성·시작·종료 등 시점을 저장 |
| `NOT NULL` | 값이 비어 있는 NULL을 허용하지 않음 |
| `DEFAULT CURRENT_TIMESTAMP` | 값을 생략했을 때 기본 시점 지정 |

`TIMESTAMPTZ`는 화면에 `+09`가 붙은 문자열 자체나 원래 지역 이름을
그대로 보관하는 타입이 아니다. 시점을 저장하고 세션의 시간대 설정에 맞게
표시한다. `CURRENT_TIMESTAMP`는 현재 트랜잭션 시작 시각을 기준으로 한다.
[날짜·시간 타입](https://www.postgresql.org/docs/18/datatype-datetime.html),
[현재 시각 함수](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)

identity만으로 PK가 되는 것은 아니다. 자동 번호 생성과 중복·NULL 방지라는
서로 다른 역할을 `IDENTITY`와 `PRIMARY KEY`로 함께 지정했다.

## 핵심 결론

SQL은 psql 자체가 아니라 PostgreSQL 서버에서 실행된다.
세미콜론은 SQL 문장의 끝이고, WHERE는 변경 대상을 제한하며,
identity 번호는 빈칸 없는 카운터가 아니다.
