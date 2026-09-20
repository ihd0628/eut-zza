# 트랜잭션: 함께 확정하거나 함께 취소하기

[Week 4 목차](./README.md)

## 1. 왜 여러 SQL을 묶는가

경기 종료 시 다음 두 작업이 함께 성공해야 하는 상황을 생각한다.

1. 참가자들의 최종 결과를 저장한다.
2. 경기 상태를 completed로 변경한다.

첫 작업이 실패했는데 경기만 완료 처리되면 원하는 상태가 아니다.
이런 DB 작업들을 하나의 확정·취소 단위로 묶는 것이 트랜잭션이다.

| 명령 | 역할 |
| --- | --- |
| `BEGIN` | 명시적 트랜잭션 시작 |
| `COMMIT` | 이번 트랜잭션의 변경 확정 |
| `ROLLBACK` | 이번 트랜잭션의 변경 취소 |

기본 psql 설정에서는 명시적 BEGIN 없이 보내는 각 SQL도 트랜잭션 안에서
처리되고, 성공하면 자동 확정된다. “BEGIN이 없으면 트랜잭션이 아예 없다”는
뜻이 아니다. 여러 명령을 한 단위로 묶을 때 BEGIN/COMMIT을 명시한다.
[PostgreSQL 트랜잭션 입문](https://www.postgresql.org/docs/18/tutorial-transactions.html)

## 2. 임시 실험 테이블 준비

아래 실험은 하나의 psql 연결에서 순서대로 실행했다.
새로 재현하려면 같은 이름의 TEMP 테이블이 없는 연결에서 시작한다.

```sql
CREATE TEMP TABLE transaction_score_lab (
  player_id INTEGER PRIMARY KEY,
  score INTEGER NOT NULL CHECK (score >= 0)
);

INSERT INTO transaction_score_lab (player_id, score)
VALUES (1, 0), (2, 0);

SELECT * FROM transaction_score_lab ORDER BY player_id;
```

초기값은 두 행 모두 0이었다. 준비 단계는 BEGIN 밖에서 실행해서 확정했다.

TEMP 테이블도 트랜잭션의 확정·취소를 실험할 수 있다. 다만 COMMIT했다고
일반 영구 테이블이 되는 것은 아니며, 연결을 끝내면 테이블 자체가 사라진다.

## 3. ROLLBACK: 두 변경을 함께 취소

```sql
BEGIN;

UPDATE transaction_score_lab
SET score = 950000
WHERE player_id = 1;

UPDATE transaction_score_lab
SET score = 970000
WHERE player_id = 2;

SELECT * FROM transaction_score_lab ORDER BY player_id;
```

확인한 결과:

```text
player_id | score
----------+-------
1         | 950000
2         | 970000
```

아직 COMMIT하지 않았어도 자신이 변경한 값은 같은 트랜잭션에서 조회할 수 있다.
UPDATE 실행 자체를 COMMIT까지 미뤄둔 것이 아니다.

```sql
ROLLBACK;

SELECT * FROM transaction_score_lab ORDER BY player_id;
```

결과는 두 행 모두 0으로 돌아왔다. 마지막 UPDATE만이 아니라 BEGIN 이후
이번 트랜잭션에서 한 두 변경을 모두 취소했다.
준비 단계에서 확정한 두 행 자체는 그대로 남았다.

## 4. COMMIT: 두 변경을 함께 확정

```sql
BEGIN;

UPDATE transaction_score_lab
SET score = 950000
WHERE player_id = 1;

UPDATE transaction_score_lab
SET score = 970000
WHERE player_id = 2;

COMMIT;

SELECT * FROM transaction_score_lab ORDER BY player_id;
```

이번에는 트랜잭션 종료 후에도 950000, 970000을 확인했다.
나중에 ROLLBACK을 실행한다고 이미 확정한 이 변경을 취소할 수는 없다.
되돌리려면 새로운 수정 작업이 필요하다.

## 5. 첫 SQL은 성공하고 두 번째 SQL은 실패하는 경우

직전 COMMIT으로 확정된 950000, 970000에서 시작했다.
기본 psql 설정(`ON_ERROR_ROLLBACK=off`)을 기준으로 하는 실험이다.

```sql
BEGIN;

UPDATE transaction_score_lab
SET score = 999999
WHERE player_id = 1;

UPDATE transaction_score_lab
SET score = -1
WHERE player_id = 2;
```

실제 출력:

```text
BEGIN
UPDATE 1
ERROR: new row for relation "transaction_score_lab" violates check constraint "transaction_score_lab_score_check"
상세정보: Failing row contains (2, -1).
eut_zza=!#
```

첫 UPDATE가 성공했다는 것은 그 명령이 실행되었다는 뜻이지,
그 변경이 이미 독립적으로 확정되었다는 뜻이 아니다.
두 번째 UPDATE의 CHECK 위반으로 현재 트랜잭션이 실패 상태가 되었다.

이어서 조회를 시도했다.

```sql
SELECT * FROM transaction_score_lab ORDER BY player_id;
```

```text
ERROR: current transaction is aborted, commands ignored until end of transaction block
```

이 상태에서는 일반 SELECT/UPDATE를 계속 진행할 수 없다.
이번 실험에서는 전체 트랜잭션을 ROLLBACK으로 정리했다.
SAVEPOINT를 이용한 부분 복구는 이번 실험 범위가 아니다.

```sql
ROLLBACK;

SELECT * FROM transaction_score_lab ORDER BY player_id;
```

실제 결과:

```text
player_id | score
----------+-------
1         | 950000
2         | 970000
```

999999도 남지 않았고 -1도 저장되지 않았다.
처음 테이블을 만들었을 때의 0이 아니라 이번 트랜잭션 직전의 확정값으로
돌아왔다는 점이 중요하다.

## 6. psql 표시와 연결해 읽기

```text
BEGIN 후 정상 진행: eut_zza=*#
SQL 오류 후 실패:   eut_zza=!#
ROLLBACK 후 종료:   eut_zza=#
```

프롬프트가 `!`로 바뀌면 쿼리 문법만 고쳐서 바로 계속하기 전에 현재
트랜잭션을 정리해야 한다. 이는 JavaScript의 예외 메시지 출력만으로
자동 복구되는 상황과 다르다. Node.js에서 DB를 사용할 때도 실패한
트랜잭션을 ROLLBACK하고 연결을 적절히 반환하는 처리가 필요하다.
[psql 오류 처리 설정](https://www.postgresql.org/docs/18/app-psql.html#APP-PSQL-VARIABLES)

## 7. ACID를 이번 실험에 연결하기

| 성질 | 의미 | 이번 학습과의 연결 |
| --- | --- | --- |
| Atomicity, 원자성 | 트랜잭션 변경 전체를 확정하거나 취소 | 두 번째 SQL이 실패했을 때 첫 번째 변경도 남지 않음 |
| Consistency, 일관성 | 정의한 데이터 규칙을 지키는 상태로 변경 | CHECK가 음수 점수를 거부 |
| Isolation, 격리성 | 동시 실행 간 영향을 격리 수준에 따라 제어 | 미확정 변경을 읽지 않음, 조회 기준과 수정 충돌 제어 |
| Durability, 지속성 | 확정된 변경을 장애 후에도 유지하도록 보장 | 기본 내구성 설정의 일반 테이블에서 WAL 등을 통해 보장 |

C는 DB가 모든 게임 규칙을 스스로 알아낸다는 뜻이 아니다.
DB 제약 조건과 올바른 애플리케이션 로직으로 필요한 규칙을 표현해야 한다.
I 역시 모든 격리 수준이 모든 트랜잭션을 순서대로 실행한 것과 같다는 뜻이 아니다.

### 지속성과 WAL은 개념만 소개했다

이번에는 강제 종료·장애 후 복구 실험까지 수행하지 않았다.
TEMP 테이블의 COMMIT 결과만으로 영구 보존을 검증했다고 볼 수도 없다.

일반 테이블의 기본 내구성 설정에서는 변경을 복구하는 데 필요한 WAL
(Write-Ahead Log)을 영구 저장한 뒤 COMMIT 성공을 응답한다.
모든 수정된 테이블 페이지를 COMMIT 때마다 즉시 디스크에 내보내야 하는
것은 아니다. 장애 후 필요한 변경을 로그로 복구할 수 있기 때문이다.
[PostgreSQL WAL 설명](https://www.postgresql.org/docs/18/wal-intro.html)

트랜잭션의 취소가 모든 외부 효과를 되돌려준다고 확대 해석하지 않는다.
예를 들어 sequence 번호 소비에는 별도 규칙이 있고, DB 밖으로 이미 보낸
메시지나 파일 작업도 DB ROLLBACK만으로 취소되지 않는다.

## 다음 실험

[MVCC, 격리 수준, 행 잠금](./mvcc-isolation-and-row-locks.md)에서는
실제 PostgreSQL 연결 두 개로 다른 트랜잭션의 변경이 언제 보이는지,
같은 행을 수정할 때 왜 기다리는지 확인한다.
