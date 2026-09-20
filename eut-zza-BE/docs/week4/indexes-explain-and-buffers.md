# B-tree, EXPLAIN, Buffer: DB가 어떤 일을 했는지 읽기

[Week 4 목차](./README.md)

## 1. 인덱스는 원본 테이블을 정렬한 배열이 아니다

인덱스는 원하는 행을 찾는 데 사용하는 별도의 자료구조다.
이번에는 PostgreSQL의 B-tree 인덱스를 사용했다.

B-tree의 기본 그림은 다음과 같다. 숫자와 분기는 개념을 위한 단순화다.

```text
                  범위를 안내하는 루트
                 /        |        \
             작은 값    중간 값    큰 값
                ↓         ↓         ↓
             ... 내부 노드와 리프 페이지 ...
```

- 한 노드에서 여러 하위 범위로 갈 수 있는 균형 트리다. 이진 트리가 아니다.
- 내부 노드는 어느 하위 페이지로 내려갈지 안내한다.
- 리프에는 정렬된 키와 테이블 행 위치를 찾기 위한 정보가 있다.
- 필요한 범위로 내려간 다음 정렬된 리프를 따라 범위 조회를 할 수 있다.
- 인덱스를 만들었다고 테이블의 모든 행이 그 순서로 물리 재배치되지는 않는다.

따라서 단일 값 탐색에서 전체 행을 하나씩 확인하는 대신 트리를 통해
후보를 좁힐 수 있다. 다만 실제 비용에는 페이지 접근, 원본 행 조회,
MVCC 확인 등도 들어가므로 실행 시간 전체를 단순히 `O(log N)`으로 끝내지는 않는다.
[PostgreSQL B-tree 구조](https://www.postgresql.org/docs/18/btree.html#BTREE-STRUCTURE)

인덱스에는 저장 공간이 필요하고 INSERT·UPDATE·DELETE 시 유지 비용도 있다.
모든 컬럼에 인덱스를 만드는 것이 목표가 아니라 실제 쿼리의 일을 줄이는 것이 목표다.

## 2. 직접 만들지 않은 인덱스가 있었던 이유

`\d scores`에서 다음 인덱스를 확인했다.

```text
scores_pkey                PRIMARY KEY, btree (id)
scores_game_player_id_key   UNIQUE CONSTRAINT, btree (game_player_id)
```

PRIMARY KEY와 UNIQUE를 정의하면서 PostgreSQL이 필요한 unique 인덱스를
자동으로 만들었다. 같은 목적의 인덱스를 추가로 만들 필요가 없다.

FK와 인덱스는 같은 기능이 아니다. 참조하는 쪽의 FK 컬럼에 인덱스가
언제나 자동 생성되는 것도 아니다. 조회·삭제 등의 패턴에 따라 따로 검토한다.
[제약 조건과 인덱스](https://www.postgresql.org/docs/18/ddl-constraints.html)

## 3. EXPLAIN, EXPLAIN ANALYZE, ANALYZE를 구분한다

| 명령 | 역할 |
| --- | --- |
| `EXPLAIN SELECT ...` | 실행 계획과 추정치를 보여준다. SELECT 자체를 실행해 결과 행을 읽지는 않는다. |
| `EXPLAIN ANALYZE SELECT ...` | 실제 실행하고 실행 시간·행 수를 함께 보여준다. |
| `ANALYZE scores` | Planner가 사용할 테이블 통계를 수집·갱신한다. |
| `EXPLAIN (ANALYZE, BUFFERS) ...` | 실행 정보와 Buffer 사용량을 확인한다. |

PostgreSQL 18에서는 ANALYZE 옵션 사용 시 BUFFERS도 기본 포함된다.
이 문서에서는 관찰 목적을 명확히 하려고 둘 다 적었다.

`EXPLAIN ANALYZE UPDATE/DELETE/INSERT`는 실제 데이터를 변경한다.
단순한 미리보기로 생각해서 운영 데이터에 실행하면 안 된다.
[EXPLAIN 명령](https://www.postgresql.org/docs/18/sql-explain.html),
[통계 수집 ANALYZE](https://www.postgresql.org/docs/18/sql-analyze.html)

## 4. 작은 scores 테이블에서 관찰한 계획 변화

처음 다음 SQL을 실행했다.

```sql
EXPLAIN
SELECT id, game_player_id, score
FROM scores
WHERE game_player_id = 1;
```

관찰한 계획:

```text
Index Scan using scores_game_player_id_key on scores
  (cost=0.15..8.17 rows=1 width=20)
  Index Cond: (game_player_id = 1)
```

다른 조건에서는 다음과 같았다.

```sql
EXPLAIN
SELECT id, game_player_id, score
FROM scores
WHERE score >= 970000;
```

```text
Seq Scan on scores (cost=0.00..23.38 rows=357 width=20)
  Filter: (score >= 970000)
```

`rows=357`은 실제로 357개가 있었다는 말이 아니다. 아직 실제 데이터와
통계가 잘 맞지 않았던 시점의 추정치다.

학습 과정에서 통계를 갱신한 뒤 다시 확인했다.

```sql
ANALYZE scores;

EXPLAIN
SELECT id, game_player_id, score
FROM scores
WHERE game_player_id = 1;
```

```text
Seq Scan on scores (cost=0.00..1.05 rows=1 width=20)
  Filter: (game_player_id = 1)
```

인덱스가 사라진 것이 아니다. 실제 행이 네 개뿐인 작은 테이블에서는
트리를 탐색하고 원본 행을 찾는 것보다 테이블을 짧게 훑는 계획이 유리할 수 있다.
Planner는 인덱스의 존재만 보지 않고 통계와 추정 비용으로 계획을 선택한다.

점수 조건의 실제 실행 결과도 확인했다.

```sql
EXPLAIN ANALYZE
SELECT id, game_player_id, score
FROM scores
WHERE score >= 970000;
```

```text
Seq Scan on scores (cost=0.00..1.05 rows=2 width=20)
  (actual time=0.022..0.023 rows=2.00 loops=1)
  Filter: (score >= 970000)
  Rows Removed by Filter: 2
  Buffers: shared hit=1
Planning:
  Buffers: shared hit=30
Planning Time: 0.721 ms
Execution Time: 0.049 ms
```

이번에는 두 행을 반환하고 두 행을 필터로 제외했다.

## 5. 각 숫자는 무엇인가

| 표시 | 읽는 방법 |
| --- | --- |
| `cost=0.00..1.05` | 첫 결과까지와 전체 결과까지의 추정 비용. ms가 아닌 비교용 단위다. |
| 추정 `rows=2` | 노드가 끝까지 실행될 때 출력할 것으로 예상한 행 수 |
| `width=20` | 출력 행 하나의 추정 평균 바이트 수 |
| `actual time=0.022..0.023` | 이 실행에서 첫 결과까지와 노드 완료까지 걸린 시간(ms) |
| 실제 `rows=2.00` | 실제로 노드가 출력한 행 수 |
| `loops=1` | 노드가 실행된 횟수 |
| `Rows Removed by Filter: 2` | 해당 필터에서 제외한 행 수 |

여러 loops가 있으면 actual time과 rows 등은 실행당 평균으로 표시되는
항목이 있으므로, 현재의 loops=1 예제처럼 곧바로 전체 수로 읽으면 안 된다.
또한 노드가 출력한 행 수와 내부에서 검사한 행 수는 다르다.
[실행 계획 숫자 읽기](https://www.postgresql.org/docs/18/using-explain.html)

## 6. 10만 행에서 단일 컬럼 인덱스 비교

기존 게임 테이블이 아닌 임시 테이블로 실험했다.
처음부터 재현하려면 같은 이름의 TEMP 테이블이 없는 psql 연결에서 시작한다.

```sql
CREATE TEMP TABLE score_index_lab (
  game_player_id INTEGER NOT NULL,
  score INTEGER NOT NULL
);

INSERT INTO score_index_lab (game_player_id, score)
SELECT n, n * 10
FROM generate_series(1, 100000) AS series(n);

ANALYZE score_index_lab;

EXPLAIN (ANALYZE, BUFFERS)
SELECT game_player_id, score
FROM score_index_lab
WHERE game_player_id = 54321;
```

`generate_series`로 1~100000의 정수를 만들고 각각 한 행으로 저장했다.
실험용 TEMP 테이블의 통계는 직접 ANALYZE해서 갱신했다.

인덱스 생성 전 결과의 핵심:

```text
Seq Scan on score_index_lab
  Filter: (game_player_id = 54321)
  Rows Removed by Filter: 99999
  Buffers: local hit=443
Execution Time: 5.922 ms
```

인덱스를 만든 뒤 동일한 SQL을 실행했다.

```sql
CREATE INDEX score_index_lab_player_idx
ON score_index_lab USING btree (game_player_id);

EXPLAIN (ANALYZE, BUFFERS)
SELECT game_player_id, score
FROM score_index_lab
WHERE game_player_id = 54321;
```

```text
Index Scan using score_index_lab_player_idx on score_index_lab
  Index Cond: (game_player_id = 54321)
  Index Searches: 1
  Buffers: local hit=1 read=2
Execution Time: 0.472 ms
```

두 실행 모두 한 행을 반환했지만, 읽고 검사한 범위는 크게 달랐다.
`Index Searches: 1`은 B-tree 탐색 횟수이지 한 페이지나 한 행만 확인했다는 뜻이 아니다.
단 한 번의 실행 시간 비율을 서비스 전체의 성능 향상 배율로 일반화하지 않는다.

## 7. Buffer와 local hit는 무엇인가

PostgreSQL 테이블·인덱스 파일은 페이지(블록) 단위로 구성된다.
페이지는 보통 8KB이고, 하나에 여러 행 또는 인덱스 항목이 들어갈 수 있다.
페이지를 읽어 사용하는 메모리 공간을 Buffer라고 이해하면 된다.
[PostgreSQL 페이지 구조](https://www.postgresql.org/docs/18/storage-page-layout.html)

예를 들어 다음 줄을 직접 읽는다.

```text
Buffers: local hit=12
```

- `local`: TEMP 테이블과 TEMP 인덱스를 위한 연결별 Buffer.
- `hit=12`: 필요한 블록이 Buffer에 이미 있어서 파일에서 다시 읽는 것을
  피한 접근 횟수.
- 12개의 행, 12번의 SELECT, 반드시 서로 다른 12개 페이지라는 뜻이 아니다.
- localhost에 접속했기 때문에 local이라고 표시되는 것이 아니다.

다음 표의 `temp`는 `local`과 다른 항목이라는 점이 중요하다.

| 항목 | 의미 |
| --- | --- |
| `shared` | 일반 테이블·인덱스 등의 공유 Buffer |
| `local` | TEMP 테이블·인덱스의 연결별 Buffer |
| `temp` | 정렬·해시 등의 작업에서 발생하는 임시 파일 I/O |
| `hit` | PostgreSQL Buffer에서 필요한 블록을 찾음 |
| `read` | PostgreSQL Buffer에 없어 파일에서 블록을 읽어옴 |

`read`라고 해서 반드시 물리 SSD를 읽었다고 단정할 수는 없다.
운영체제 파일 캐시가 그 읽기에 응답했을 수도 있다.
일반 시스템 카탈로그를 참조하므로 TEMP 쿼리에도 shared 사용량이 나타날 수 있다.
[BUFFERS 설명](https://www.postgresql.org/docs/18/sql-explain.html),
[통계와 OS 캐시의 구분](https://www.postgresql.org/docs/18/monitoring-stats.html)

### SELECT 결과 캐시가 아니다

페이지가 메모리에 있어도 SQL 실행과 조건 검사 등은 수행한다.
“똑같은 SELECT라서 지난 응답을 통째로 돌려준다”는 뜻이 아니다.

반복 실행에서 `read`가 줄고 `hit`로 바뀌는 것은 캐시가 따뜻해진 효과일 수 있다.
반면 모든 접근이 hit인 서로 다른 계획끼리 비교할 때는 hit가 적은 쪽이
필요한 페이지 접근 자체를 줄였을 수 있다. 무조건 hit가 많을수록 좋지는 않다.

## 8. 왜 Limit → Sort → Scan 순서로 보이는가

다음은 시간순 작업 목록이 아니라 부모·자식 실행 계획 트리다.

```text
Limit
  -> Sort
       -> Seq Scan
```

이 단순 실행 계획에서는 상위 노드가 하위 노드에 필요한 다음 행을 요청한다.
요청은 아래로 내려가고 결과 행은 위로 전달된다.

1. Limit가 정렬된 결과를 요청한다.
2. Sort는 정렬할 후보를 얻기 위해 Scan에서 입력 행을 받는다.
3. Scan은 테이블을 읽고 조건에 맞는 행을 반환한다.
4. Sort가 상위 결과를 준비하고 Limit가 필요한 개수만 반환한다.

따라서 “맨 아래 노드를 완전히 끝내고 항상 위 노드를 시작한다”도 정확한
일반 규칙은 아니다. Sort처럼 전체 입력이 필요한 작업과, 다음 행을 하나씩
전달할 수 있는 작업을 구분해야 한다.

```text
Limit
  -> Index Scan
```

인덱스가 필요한 순서를 제공하면, Limit는 10개를 받은 뒤 더 요청하지 않아
Index Scan을 일찍 멈출 수 있다. [PostgreSQL Executor의 demand-pull 모델](https://www.postgresql.org/docs/18/executor.html)

## 9. 부모 Buffer와 Planning을 잘못 읽지 않기

```text
Limit
  Buffers: local hit=12
  -> Index Scan
       Buffers: local hit=12
Planning:
  Buffers: shared hit=18, local read=1
Planning Time: 0.614 ms
Execution Time: 0.077 ms
```

- 상위 노드의 Buffer 값에는 하위 노드 사용량이 포함된다. 12+12=24로 더하지 않는다.
- Planning은 마지막에 실행한 자식 노드가 아니라 계획 생성 단계의 별도 통계다.
- 실행 전에 계획을 세우고 실행한 뒤, 보고서에 실행 계획과 통계를 함께 출력한다.
- Planning Time과 Execution Time은 서로 다른 단계의 시간이다.
- 일부 항목이 안 보이면 0인 통계가 생략된 것일 수 있다.

다음 [복합 인덱스 실험](./composite-index-lab.md)에서는 같은 쿼리의 최상위
Limit 노드끼리 비교해 중복 합산을 피한다.
