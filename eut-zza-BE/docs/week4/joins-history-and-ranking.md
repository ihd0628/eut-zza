# JOIN으로 경기 기록과 랭킹 조회하기

[Week 4 목차](./README.md)

## 1. JOIN은 무엇을 연결하는가

실제로 실행한 한 경기의 결과 조회다.

```sql
SELECT
  gp.game_session_id,
  u.id AS user_id,
  u.email,
  sc.score,
  sc.max_combo
FROM scores AS sc
JOIN game_players AS gp
  ON gp.id = sc.game_player_id
JOIN users AS u
  ON u.id = gp.user_id
WHERE gp.game_session_id = 1
ORDER BY sc.score DESC;
```

처음에는 “scores에서 전부 꺼내고, JOIN하면 다음 명령에서도 테이블들이
연결된 상태가 되는 것인가?”라고 생각했다. 둘 다 아니다.

- `FROM scores AS sc`: 결과를 만들 때 scores를 `sc`라는 별명으로 사용한다.
- `JOIN ... ON ...`: 이번 조회에서 조건이 맞는 행들을 연결한다.
- `gp.game_session_id`: game_players에서 가져오는 컬럼이다.
- `u.email`: users에서 가져오는 컬럼이다.
- `sc.score`: scores에서 가져오는 컬럼이다.

실제 테이블을 합치거나 복사하지 않으며, 다음 SQL에 JOIN 설정이 남지도 않는다.
별명 `sc`, `gp`, `u`도 이 쿼리 범위에서 사용하는 이름이다.

이번 `JOIN`은 `INNER JOIN`이다. 연결 조건에 맞는 행만 결과에 포함된다.
따라서 scores에서 시작하는 이 쿼리는 결과가 아직 없는 참가자를 보여주지 않는다.
그런 화면은 다른 조회 설계가 필요하다.
[PostgreSQL JOIN 설명](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-JOIN)

## 2. Foreign Key와 JOIN의 차이

| 기능 | 역할 |
| --- | --- |
| Foreign Key | 저장·수정·삭제 시 참조 관계가 깨지지 않도록 검사 |
| JOIN | 조회 시 조건이 맞는 행을 연결하여 결과 구성 |

FK를 만들었다고 SELECT에 관련 테이블의 컬럼이 자동으로 추가되지 않는다.
반대로 FK가 없더라도 JOIN 조건을 작성할 수는 있다.

SQL을 이해할 때는 “JOIN과 필터로 결과를 구성하고, 정렬해 출력한다”는
논리적 흐름을 생각하면 된다. 실제 물리적 실행 순서는 Query Planner가
다른 방식으로 최적화할 수 있다. 예를 들어 WHERE 조건을 먼저 적용할 수 있다.

## 3. 사용자의 완료된 경기 기록

다음 SQL을 실행했다.

```sql
SELECT
  gs.id AS game_session_id,
  so.title AS song_title,
  b.difficulty,
  u.email,
  sc.score,
  sc.max_combo
FROM scores AS sc
JOIN game_players AS gp
  ON gp.id = sc.game_player_id
JOIN users AS u
  ON u.id = gp.user_id
JOIN game_sessions AS gs
  ON gs.id = gp.game_session_id
JOIN beatmaps AS b
  ON b.id = gs.beatmap_id
JOIN songs AS so
  ON so.id = b.song_id
WHERE u.id = 1
  AND gs.status = 'completed'
ORDER BY gs.ended_at DESC, sc.id DESC;
```

당시 경기 한 판이 기록되어 있을 때의 결과:

```text
game_session_id | song_title        | difficulty | email            | score  | max_combo
----------------+-------------------+------------+------------------+--------+----------
1               | 로보티컬 뽕짝 리듬 | normal     | test@example.com | 970000 | 4
```

이후 경기를 추가했으므로 지금 재조회하면 행 개수가 달라질 수 있다.
`ended_at DESC`는 최근 종료 경기부터, `sc.id DESC`는 종료 시각이 같을 때의
추가 정렬 기준이다.

여기서 판정 개수 4와 970000 같은 점수는 SQL 연습용 값이다.
현재 게임 엔진의 실제 점수 계산식을 검증한 결과가 아니다.

## 4. 경기 결과 INSERT의 모양

아래는 당시 첫 경기 데이터를 설명하기 위한 INSERT 예다.
이미 기록된 참가자에 다시 실행하면 UNIQUE 위반이므로 재실행용 seed가 아니다.
`game_players`의 실제 ID를 먼저 확인해야 한다.

```sql
INSERT INTO scores (
  game_player_id, score,
  perfect_count, great_count, good_count, miss_count, max_combo
)
VALUES
  (1, 970000, 4, 0, 0, 0, 4),
  (2, 950000, 3, 1, 0, 0, 4)
RETURNING id, game_player_id, score;
```

경기를 완료로 바꾸는 UPDATE의 모양은 다음과 같다.
현재 데이터를 재설정하라는 뜻이 아니라 각 SQL의 책임을 보여주는 예다.

```sql
UPDATE game_sessions
SET status = 'completed', ended_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

향후 API에서 이 두 작업을 함께 성공시켜야 한다면 하나의 트랜잭션으로
묶는다. SQL을 따로 실행했다는 사실만으로 자동으로 한 트랜잭션이 되지 않는다.

## 5. 사용자별 최고 점수와 플레이 횟수

두 경기의 점수를 집계했다. 당시 데이터의 핵심은 다음과 같다.

| 사용자 | 첫 경기 | 두 번째 경기 |
| --- | --- | --- |
| 1: test@example.com | 970000 | 930000 |
| 3: updated@example.com | 950000 | 980000 |

```sql
SELECT
  u.id AS user_id,
  u.email,
  MAX(sc.score) AS best_score,
  COUNT(*) AS play_count
FROM scores AS sc
JOIN game_players AS gp
  ON gp.id = sc.game_player_id
JOIN users AS u
  ON u.id = gp.user_id
JOIN game_sessions AS gs
  ON gs.id = gp.game_session_id
WHERE gs.beatmap_id = 1
  AND gs.status = 'completed'
GROUP BY u.id, u.email
ORDER BY best_score DESC, u.id ASC
LIMIT 10;
```

관찰한 결과:

```text
user_id | email               | best_score | play_count
--------+---------------------+------------+-----------
3       | updated@example.com | 980000     | 2
1       | test@example.com    | 970000     | 2
```

이번 쿼리에서 각 부분의 역할:

1. JOIN으로 점수와 사용자, 경기를 연결한다.
2. WHERE로 1번 채보의 완료된 경기만 남긴다.
3. GROUP BY로 같은 사용자의 결과를 하나의 그룹으로 묶는다.
4. MAX는 그룹에서 가장 큰 점수 값, COUNT는 그룹의 결과 행 수를 계산한다.
5. 최고 점수 내림차순으로 정렬하고 동점이면 사용자 ID로 순서를 정한다.
6. LIMIT 10으로 상위 사용자 열 명까지만 반환한다.

`COUNT(*)`는 모든 참가 기록이 아니라 이 JOIN·WHERE를 통과한 점수 행 수다.
현재 스키마는 참가 하나에 결과를 최대 한 개만 허용하므로 이 쿼리에서는
조건에 맞는 결과가 저장된 플레이 횟수로 해석했다.

## 6. MAX는 가장 높은 점수의 행 전체를 가져오지 않는다

`MAX(sc.score)`가 반환하는 것은 점수 값이다.
그 점수를 기록한 경기의 ID·시간·콤보까지 자동으로 따라오지는 않는다.
각 컬럼에 따로 MAX를 적용해도 서로 같은 경기에서 나온 값이라는 보장이 없다.

또한 다음 두 질문은 다르다.

- 모든 경기 결과 중 점수가 높은 10개: 한 사용자가 여러 번 나올 수 있다.
- 사용자별 최고 점수를 구한 뒤 상위 10명: 사용자당 하나의 집계 결과다.

[복합 인덱스 실험](./composite-index-lab.md)은 첫 번째에 가까운 단순 조회다.
그 인덱스 하나로 위 사용자별 집계 랭킹까지 그대로 해결된다고 단정하지 않는다.

이 절의 psql 실험에서는 `beatmap_id = 1`을 기준으로 사용했다.
이후 9월 21일 구현한 `GET /songs/:id/ranking`에서는 곡 ID와 `difficulty`
쿼리 파라미터로 구분했다. 실제 API SQL의 한 줄씩 설명과 최신 결과는
[랭킹·경기 기록 API 문서](./ranking-and-history-apis.md)에 이어서 기록했다.

## 핵심 결론

JOIN은 이번 쿼리의 결과를 연결하고, GROUP BY는 연결된 결과를 그룹별로
집계한다. DB 저장 구조, 조회 결과, 프론트엔드에 응답할 JSON 구조는
서로 같은 모양일 필요가 없다.
