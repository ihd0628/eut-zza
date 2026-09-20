# 복합 인덱스: 컬럼 순서가 바뀌면 왜 local hit가 달라지는가

[Week 4 목차](./README.md) · [EXPLAIN과 Buffer 기초](./indexes-explain-and-buffers.md)

## 1. 실험 질문과 데이터

목표는 “42번 채보의 경기 기록 중 점수가 높은 10개”를 조회하는 것이다.
사용자별 최고 점수를 집계하는 실제 랭킹 쿼리와는 다른 단순화된 실험이다.

같은 psql 연결에서 순서대로 실행했다.
재현할 때는 같은 이름의 TEMP 테이블이 없는 연결에서 시작한다.

```sql
CREATE TEMP TABLE composite_index_lab (
  id INTEGER NOT NULL,
  beatmap_id INTEGER NOT NULL,
  score INTEGER NOT NULL
);

INSERT INTO composite_index_lab (id, beatmap_id, score)
SELECT
  n,
  ((n - 1) % 1000) + 1,
  n * 10
FROM generate_series(1, 100000) AS series(n);

ANALYZE composite_index_lab;
```

- 전체 100000행.
- beatmap_id는 1~1000을 반복하므로 채보마다 100행.
- score는 n에 따라 증가하므로 각 행의 점수는 모두 다름.
- 조회 조건은 전체에서 100행을 찾고 그중 상위 10행을 반환함.

공통 조회 SQL:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, beatmap_id, score
FROM composite_index_lab
WHERE beatmap_id = 42
ORDER BY score DESC
LIMIT 10;
```

## 2. 인덱스가 없을 때

실제 결과의 일부를 발췌했다.

```text
Limit (cost=1793.16..1793.19 rows=10 width=12)
  Buffers: local hit=541
  -> Sort (cost=1793.16..1793.41 rows=100 width=12)
       Sort Key: score DESC
       Sort Method: top-N heapsort  Memory: 25kB
       Buffers: local hit=541
       -> Seq Scan on composite_index_lab
            Filter: (beatmap_id = 42)
            Rows Removed by Filter: 99900
            Buffers: local hit=541
Execution Time: 12.376 ms
```

후속 두 번의 실행 시간은 11.563ms, 12.672ms였고 local hit는 모두 541이었다.

전체 10만 행에서 99900행을 제외하고 100행을 정렬 후보로 얻었다.
top-N heapsort는 상위 10개만 유지하는 방식으로 정렬 비용을 줄이지만,
어떤 점수가 상위인지 판단하려면 후보 100개는 모두 확인해야 한다.
LIMIT 10이라고 처음 발견한 열 행만 보고 멈출 수 있는 상황이 아니다.

## 3. `(beatmap_id, score DESC)` 인덱스

```sql
CREATE INDEX composite_lab_beatmap_score_idx
ON composite_index_lab (beatmap_id, score DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, beatmap_id, score
FROM composite_index_lab
WHERE beatmap_id = 42
ORDER BY score DESC
LIMIT 10;
```

첫 실행의 관찰값:

```text
Limit
  Buffers: local hit=10 read=2
  -> Index Scan using composite_lab_beatmap_score_idx on composite_index_lab
       Index Cond: (beatmap_id = 42)
       Index Searches: 1
       Buffers: local hit=10 read=2
Planning:
  Buffers: shared hit=18, local read=1
Planning Time: 0.614 ms
Execution Time: 0.077 ms
```

같은 조회를 한 번 더 실행한 결과:

```text
Limit (cost=0.29..37.66 rows=10 width=12)
  Buffers: local hit=12
  -> Index Scan using composite_lab_beatmap_score_idx on composite_index_lab
       Index Cond: (beatmap_id = 42)
       Index Searches: 1
       Buffers: local hit=12
Planning Time: 0.110 ms
Execution Time: 0.064 ms
```

이 인덱스는 채보별로 모으고, 같은 채보 안에서 점수가 높은 순서로 배치한다.
42번 구간의 실제 데이터 일부는 다음과 같다.

```text
beatmap_id    score
42            990420
42            980420
42            970420
42            960420
...
```

B-tree로 42번 구간의 높은 점수 쪽 시작점을 찾고, 필요한 10개를 순서대로
얻는다. 별도 Sort가 없고, LIMIT을 채우면 더 읽지 않아도 된다.
[인덱스와 ORDER BY/LIMIT](https://www.postgresql.org/docs/18/indexes-ordering.html)

## 4. `(score DESC, beatmap_id)`로 순서를 바꾸기

좋은 순서의 인덱스를 남겨두면 Planner가 그것을 선택할 수 있으므로,
방금 만든 실험용 인덱스만 제거하고 반대 순서를 만들었다.
아래 DROP 대상은 현재 연결의 TEMP 테이블에 만든 인덱스로 한정된다.

```sql
DROP INDEX pg_temp.composite_lab_beatmap_score_idx;

CREATE INDEX composite_lab_score_beatmap_idx
ON composite_index_lab (score DESC, beatmap_id);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, beatmap_id, score
FROM composite_index_lab
WHERE beatmap_id = 42
ORDER BY score DESC
LIMIT 10;
```

첫 실행:

```text
Limit
  Buffers: shared hit=3, local hit=10 read=29
  -> Index Scan using composite_lab_score_beatmap_idx on composite_index_lab
       Index Cond: (beatmap_id = 42)
       Index Searches: 1
       Buffers: shared hit=3, local hit=10 read=29
Planning Time: 0.878 ms
Execution Time: 1.648 ms
```

후속 실행:

```text
Limit (cost=0.29..202.12 rows=10 width=12)
  Buffers: local hit=39
  -> Index Scan using composite_lab_score_beatmap_idx on composite_index_lab
       Index Cond: (beatmap_id = 42)
       Index Searches: 1
       Buffers: local hit=39
Planning Time: 0.102 ms
Execution Time: 0.695 ms
```

인덱스를 못 쓴 것이 아니다. 같은 Index Scan이더라도 더 넓은 구간을 탐색했다.

## 5. 역순에서 더 넓게 읽는 이유

두 번째 인덱스는 전체 채보의 기록을 먼저 점수순으로 배치한다.

```text
score         beatmap_id
1000000       1000
999990        999
999980        998
...           ...
990420        42      ← 첫 번째 대상
990410        41
...           ...
980420        42      ← 두 번째 대상
...           ...
```

두 번째 컬럼의 정렬은 첫 번째 컬럼의 값이 같을 때 순서를 정한다.
score가 첫 번째인 인덱스에서는 42번 기록 전체가 한곳에 모이지 않는다.
이번 데이터는 점수가 모두 다르고, 42번 항목이 점수순에서 약 1000개마다
한 번씩 나타난다.

따라서 이번 계획은 높은 점수 쪽부터 더 많은 인덱스 항목을 살펴보며
42번인 항목 열 개를 찾아야 한다. 점수순이라는 장점으로 Sort는 피하지만,
대상을 좁히는 효율은 떨어진다.

이때 조건에 맞지 않는 항목은 인덱스 내부에서 제외할 수 있다.
다른 채보의 모든 항목을 원본 테이블까지 방문해서 읽는다는 뜻은 아니다.
`Index Cond`가 표시됐다는 사실만으로 탐색 구간이 충분히 좁다고 단정할 수도 없다.

“복합 인덱스의 첫 컬럼에 조건이 없으면 무조건 인덱스를 못 쓴다”는 설명은
틀리다. PostgreSQL 18은 상황에 따라 skip scan 등도 사용할 수 있다.
여기서의 결론은 이 쿼리·분포에서는 채보를 앞에 두는 쪽이 더 적게 읽었다는 것이다.
[복합 B-tree 인덱스와 skip scan](https://www.postgresql.org/docs/18/indexes-multicolumn.html)

## 6. 541, 12, 39를 어떻게 비교하는가

반복 실행의 최상위 Limit 노드를 비교했다.

| 조건 | 계획 | local hit | 실행 시간 |
| --- | --- | ---: | ---: |
| 인덱스 없음 | Limit → Sort → Seq Scan | 541 | 11.563ms |
| `(beatmap_id, score DESC)` | Limit → Index Scan | 12 | 0.064ms |
| `(score DESC, beatmap_id)` | Limit → Index Scan | 39 | 0.695ms |

세 경우 모두 결과는 10행이다. 다른 것은 결과를 얻기 위해 수행한 작업이다.

- 541: 전체 테이블을 훑어서 조건에 맞는 후보를 얻었다.
- 12: 대상 채보의 좁은 인덱스 구간에서 상위 결과를 찾았다.
- 39: 점수순으로 흩어진 대상을 찾느라 더 많은 인덱스 페이지에 접근했다.

숫자는 인덱스와 테이블의 Buffer 접근을 합친 관찰값이며, 검사한 행 수나
서로 다른 페이지 개수로 바꿔 읽으면 안 된다. 이 출력만으로 인덱스와
테이블 접근을 정확히 몇 회씩 했는지 분해해서 단정하지 않는다.

부모 Limit와 자식 Index Scan의 같은 Buffer 값은 중복해서 더하지 않는다.
또한 hit는 성공적인 캐시 사용이지만, 이 비교에서 39가 12보다 좋다는
뜻은 아니다. 캐시에 있는 페이지라도 불필요하게 더 읽고 검사하면 일이 늘어난다.

## 핵심 결론

같은 열 개를 찾더라도 대상이 모여 있으면 조금만 살펴보고,
흩어져 있으면 더 많이 살펴봐야 한다. 그 차이가 이번에는 local hit의
12와 39로 나타났다. 인덱스의 존재 여부뿐 아니라 컬럼 순서와 쿼리의
필터·정렬·LIMIT을 함께 봐야 한다.
