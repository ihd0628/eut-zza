# 두 연결로 확인한 MVCC, 격리 수준, 행 잠금

[Week 4 목차](./README.md) · [트랜잭션 기초](./transactions-and-acid.md)

## 1. 세 개의 개념을 구분한다

| 개념 | 역할 |
| --- | --- |
| MVCC | 행의 여러 버전을 관리해 조회 기준에 맞는 버전을 제공하는 방식 |
| 격리 수준 | 다른 트랜잭션의 변경을 어떤 기준으로 보고 동시 실행을 다룰지 정하는 규칙 |
| 행 잠금 | 같은 행에 대한 충돌하는 수정을 조정하는 장치 |

MVCC를 사용한다고 잠금이 없어지지 않는다.
일반 SELECT는 이전 버전을 읽을 수 있지만, 같은 행을 수정하는 UPDATE끼리는
기다리는 상황이 생길 수 있다.
[PostgreSQL MVCC 개요](https://www.postgresql.org/docs/18/mvcc-intro.html)

## 2. 두 psql 연결 준비

터미널 창 두 개에서 각각 접속했다.

```bash
/opt/homebrew/opt/postgresql@18/bin/psql eut_zza
```

- 창 A: Session A.
- 창 B: Session B.
- 같은 DB에 접속하지만 서로 다른 연결이다.
- 한 연결에서 BEGIN했다고 다른 연결도 같은 트랜잭션에 참여하지 않는다.

아래 실험들은 순서대로 이어진다. 각 실험이 끝나면 양쪽 모두 COMMIT 또는
ROLLBACK으로 정리한다. 프롬프트에 `*`나 `!`가 남았는지 확인한다.
기본 autocommit 설정에서 시작하며, 처음 두 실험은 Read Committed를 사용한다.

### A에서 일반 실험 테이블 생성

```sql
CREATE TABLE public.transaction_shared_lab (
  player_id INTEGER PRIMARY KEY,
  score INTEGER NOT NULL CHECK (score >= 0)
);

INSERT INTO public.transaction_shared_lab (player_id, score)
VALUES (1, 1000);
```

이 단계는 BEGIN 밖에서 실행해서 확정했다.
`public`은 스키마 이름이며, 테이블 이름 앞에 소속을 명시한 것이다.
두 연결에서 접근해야 하므로 TEMP를 사용하지 않았다.

이미 이 테이블이 있다면 다시 만들거나 임의로 점수를 초기화하지 않는다.
현재 값을 확인하고 문서의 시작값과 비교한다.

## 3. 실험 1 — 아직 확정하지 않은 변경은 다른 연결에서 보이는가

### 3-1. A에서 수정, 아직 COMMIT하지 않기

```sql
BEGIN;

UPDATE public.transaction_shared_lab
SET score = score + 100
WHERE player_id = 1;

SELECT * FROM public.transaction_shared_lab;
```

A에서는 1100을 읽는다. 자기 트랜잭션에서 한 변경이므로 아직 미확정이어도 보인다.
A를 그대로 두고 B로 이동한다.

### 3-2. B에서 같은 행 조회

```sql
BEGIN;

SHOW transaction_isolation;

SELECT * FROM public.transaction_shared_lab;
```

기본 설정의 격리 수준은 `read committed`이고, 조회 결과는 1000이다.
B의 일반 SELECT는 A가 수정한 1100을 읽지 않는다.
또한 이 UPDATE의 행 잠금 때문에 A의 종료를 기다리는 대신 기존 확정값을 반환한다.

### 3-3. A에서 확정

```sql
COMMIT;
```

### 3-4. B에서 다시 조회하고 종료

```sql
SELECT * FROM public.transaction_shared_lab;

COMMIT;
```

두 번째 조회에서는 1100이 보인다.
이 순서의 결과 흐름은 다음과 같다.

```text
A UPDATE 후 A SELECT     → 1100
A 미확정 상태의 B SELECT → 1000
A COMMIT
B의 다음 SELECT          → 1100
```

Read Committed의 일반 SELECT는 각 쿼리 시작 시 새 조회 기준을 잡는다.
따라서 B가 같은 트랜잭션 안에서 두 번 SELECT해도 그 사이 다른 트랜잭션이
확정했다면 결과가 달라질 수 있다.
[Read Committed 규칙](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED)

## 4. 실험 2 — 같은 행을 둘 다 수정하면 어떻게 되는가

앞 실험의 양쪽 COMMIT을 마치고 점수가 1100인 상태에서 시작했다.

### 4-1. A에서 100을 더하고 잠금 유지

```sql
BEGIN;

UPDATE public.transaction_shared_lab
SET score = score + 100
WHERE player_id = 1
RETURNING player_id, score;
```

A는 1200을 반환했다. 여기서 아직 COMMIT하지 않았다.
RETURNING은 방금 수정한 결과를 보여줄 뿐, 확정 명령이 아니다.

### 4-2. B에서 같은 행에 10을 더하기

```sql
BEGIN;

UPDATE public.transaction_shared_lab
SET score = score + 10
WHERE player_id = 1
RETURNING player_id, score;
```

사용자는 B의 UPDATE가 실제로 기다리는 것을 확인했다.
BEGIN 출력 이후 UPDATE 결과와 다음 입력 프롬프트가 아직 돌아오지 않았다.
DB 전체나 JavaScript 메인 스레드가 멈춘 것이 아니라 해당 UPDATE가
충돌하는 변경의 종료를 기다리는 상태다.

이때 B에 명령을 계속 입력하지 말고 A로 이동한다.

### 4-3. A에서 COMMIT

```sql
COMMIT;
```

그러자 B의 UPDATE가 이어서 실행되고 실제로 1210을 반환했다.

```text
1100
  + A의 100 → 1200 확정
  + B의 10  → 1210, 아직 B에서는 미확정
```

Read Committed의 이 UPDATE는 A가 확정한 행에 대해 WHERE 조건을 다시
확인하고, 여전히 대상이면 그 최신 버전에 수정을 적용한다.
따라서 초기 1100이 아니라 1200에 +10이 적용되었다.

여기서 `SET score = score + 10`과 `SET score = 1110`은 다르다.
고정값 1110을 지정했다면 DB가 알아서 더하기 의도로 바꾸지 않는다.
잠금이 있다고 모든 애플리케이션의 잘못된 덮어쓰기가 자동 해결되는 것은 아니다.

### 4-4. B도 확정 후 조회

```sql
COMMIT;
```

이후 A에서 확인했다.

```sql
SELECT * FROM public.transaction_shared_lab;
```

최종 확정 점수는 1210이다.
일반 UPDATE는 필요한 행 잠금을 자동으로 획득하고, 이번과 같은 명시적
트랜잭션에서는 문장이 끝나도 잠금이 유지되다가 트랜잭션 종료 때 해제된다.
[행 잠금 설명](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)

## 5. 실험 3 — Repeatable Read에서는 COMMIT 후에도 왜 옛값을 읽는가

앞 실험을 마치고 양쪽 모두 트랜잭션 밖이며 점수 1210에서 시작했다.
이번에는 B가 먼저 조회해야 한다.

### 5-1. B에서 Repeatable Read로 첫 조회

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;

SELECT * FROM public.transaction_shared_lab
WHERE player_id = 1;
```

실제 결과는 1210이었다. 이 BEGIN은 이번 트랜잭션의 격리 수준을 정한다.
DB 전체의 기본 격리 수준을 바꾸는 명령이 아니다.

### 5-2. A에서 변경하고 확정

```sql
BEGIN;

UPDATE public.transaction_shared_lab
SET score = score + 100
WHERE player_id = 1
RETURNING player_id, score;

COMMIT;
```

A에서 1310으로 변경해 확정했다.

### 5-3. B에서 같은 트랜잭션으로 재조회

```sql
SELECT * FROM public.transaction_shared_lab
WHERE player_id = 1;
```

사용자가 제출한 결과는 여전히 1210이었다.

### 5-4. B 종료 후 새 조회

```sql
COMMIT;

SELECT * FROM public.transaction_shared_lab
WHERE player_id = 1;
```

이번에는 1310을 확인했다.

Repeatable Read는 트랜잭션의 첫 일반 명령 시작 시 확보한 snapshot을
이후 조회에서도 유지한다. 이 실험에서는 첫 SELECT가 그 시점이다.
단순히 BEGIN 명령을 입력한 순간으로 설명하면 정확하지 않다.
또한 자기 트랜잭션에서 직접 변경한 내용은 이후 조회에 보일 수 있다.
[Repeatable Read 규칙](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-REPEATABLE-READ)

## 6. Snapshot과 MVCC를 어떻게 이해할 것인가

여기서 snapshot은 DB 전체나 SELECT 결과를 통째로 복사해두는 기능이 아니다.
어떤 트랜잭션의 변경을 볼 수 있는지 판단하는 정보와 기준으로 이해하면 된다.
PostgreSQL은 행의 버전과 트랜잭션 정보를 이용해 그 기준에 맞는 행을 읽는다.

개념적으로 같은 논리적 행에 대해 다음 두 버전이 존재할 수 있다.

```text
이전 버전: player_id=1, score=1210
새 버전:   player_id=1, score=1310
```

B의 기존 Repeatable Read 조회는 이전 버전을 읽고,
트랜잭션 종료 후 새 조회는 확정된 새 버전을 읽었다.
사용자에게 오래된 API 응답을 캐시해서 돌려준 것이 아니다.

다른 사람이 데이터를 수정할 때 독자가 무조건 쓰기 완료까지 기다리게 하는
대신, 자신에게 적합한 일관된 버전을 읽을 수 있다는 것이 MVCC의 이점이다.
오래된 행 버전을 영원히 모두 보관한다는 뜻도 아니다.

다만 “SELECT는 절대로 잠금 때문에 기다리지 않는다”로 확대하면 안 된다.
이번 일반 SELECT가 UPDATE의 행 잠금 때문에 기다리지 않은 것이다.
`SELECT FOR UPDATE`나 일부 테이블 수준 잠금이 있는 상황은 다르다.

## 7. 이번 실험으로 확인한 차이

| 상황 | 관찰 |
| --- | --- |
| 자신의 미확정 UPDATE 후 SELECT | 자신이 변경한 값을 읽음 |
| 다른 연결이 미확정 UPDATE 중, 일반 SELECT | 기존 확정값을 읽을 수 있음 |
| 다른 연결이 같은 행을 미확정 UPDATE 중, UPDATE | 선행 트랜잭션 종료를 기다림 |
| Read Committed에서 다른 연결이 확정한 뒤 재조회 | 새 쿼리에서 변경값을 읽음 |
| Repeatable Read의 첫 조회 후 다른 연결이 확정, 같은 트랜잭션 재조회 | 이전 조회 기준을 유지 |
| Repeatable Read 종료 후 새 조회 | 새로 확정된 값을 읽음 |

마지막 두 실험의 실제 관찰값은 1210(잠금 해제 후 B 수정 결과),
1210 → 1210 → 1310(Repeatable Read의 B 조회 순서)이었다.

## 현재 범위와 후속 주의점

이 실험은 모든 동시성 문제를 해결하는 구현을 완성한 것이 아니다.
Repeatable Read를 쓰면 모든 경쟁 상태가 사라지거나, 모든 트랜잭션을
한 번에 하나씩 실행한 것과 같아지는 것은 아니다.

이번에는 Serializable, deadlock, SAVEPOINT, Repeatable Read에서의
쓰기 충돌 재시도까지 실험하지 않았다. 현재 구현에 필요해지면 추가로 다룬다.

학습 로그상 실험용 일반 테이블 `public.transaction_shared_lab`의 마지막 값은
1310이었다. 문서 작성 과정에서 이를 삭제하거나 초기화하지 않았다.
