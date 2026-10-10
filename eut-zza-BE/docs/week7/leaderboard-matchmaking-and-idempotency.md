# Redis Leaderboard, 자동 매칭과 결과 멱등성

## 1. 전체 구조

Week 7에서는 기존의 직접 방 생성·입장을 유지하면서 자동 매칭을 추가했다. 영속 경기 결과의 원본은 계속 PostgreSQL이며 Redis는 없어져도 복구할 수 있는 상태만 담당한다.

```text
Browser
├── 자동 매칭 참가·취소·상태 조회
└── 곡·난이도별 랭킹 조회
          │
          ↓
Fastify
├── MatchmakingService
├── LeaderboardService
└── 기존 RoomStore / 경기 Service
          │
          ├── Redis: 대기열, 짧은 매칭 상태, 랭킹 캐시
          └── PostgreSQL: 경기 결과 원본
```

Redis 연결은 `src/redis.ts`에서 프로세스당 하나를 재사용한다. 연결 실패 후에는 다음 요청에서 다시 연결할 수 있으며, 애플리케이션 종료 시 연결을 닫는다.

---

## 2. Leaderboard 데이터 흐름

### 저장 순서

```text
클라이언트가 경기 결과 제출
        ↓
PostgreSQL transaction으로 점수와 경기 완료 저장
        ↓
COMMIT 성공
        ↓
PostgreSQL에서 해당 곡·난이도의 사용자별 MAX(score) 재집계
        ↓
Redis Sorted Set과 metadata Hash 교체
```

Redis 갱신은 반드시 PostgreSQL 저장 다음에 실행한다. Redis 오류는 로그로 남기되 이미 성공한 PostgreSQL 결과 저장을 실패로 바꾸지 않는다.

### Redis key

곡 `1`, 난이도 `normal`의 예시는 다음과 같다.

```text
eutzza:leaderboard:1:normal:scores
→ Sorted Set
→ member = userId
→ score = PostgreSQL에서 계산한 bestScore

eutzza:leaderboard:1:normal:metadata
→ Hash
→ field = userId
→ value = email, playCount를 직렬화한 JSON

eutzza:leaderboard:1:normal:ready
→ String
→ 캐시한 사용자 수
```

세 key에는 24시간 TTL을 적용한다. `ready`에 기록한 수와 Sorted Set의 사용자 수가 다르면 일부 캐시가 유실된 것으로 보고 PostgreSQL에서 다시 만든다.

### 낮은 점수와 동점

Redis에 새 점수를 바로 덮어쓰지 않고 PostgreSQL의 모든 완료 결과에서 `MAX(score)`를 다시 계산한다. 따라서 나중에 제출한 점수가 낮아도 기존 최고 점수가 내려가지 않는다.

동점은 competition ranking 규칙을 사용한다.

```text
점수: 1000, 1000, 800
순위:    1,    1,   3
```

Redis Sorted Set 자체가 공동 등수 숫자를 만들어주는 것은 아니다. API 응답을 만들 때 애플리케이션이 점수를 비교해 같은 점수에 같은 등수를 부여한다.

### Cache Miss와 복구

```text
Redis key 없음 또는 불완전함
        ↓ Cache Miss
PostgreSQL 집계 쿼리 실행
        ↓
응답 생성
        ↓
Redis 캐시 재구성 시도
```

Redis를 재시작하거나 캐시가 만료돼도 PostgreSQL의 경기 결과가 남아 있으므로 랭킹을 복구할 수 있다. Redis 연결 자체가 실패하면 해당 요청은 PostgreSQL 결과를 그대로 반환한다.

---

## 3. 자동 매칭 상태와 API

```text
POST /matchmaking/join
→ 대기열 참가 또는 기존 상태 반환

GET /matchmaking/status
→ idle / waiting / matched 조회
→ waiting이면 TTL 갱신 및 매칭 조건 확인

DELETE /matchmaking
→ 아직 방에 들어가지 않은 대기 상태 취소
```

프론트엔드는 대기 중 1초마다 상태를 조회한다. `matched`와 `roomId`를 받으면 Week 6의 기존 방 URL로 이동한다. 새로고침해도 Redis의 사용자 상태를 다시 조회하므로 대기 화면을 복구할 수 있다.

직접 방을 생성하거나 입장하면 남아 있을 수 있는 자동 매칭 상태를 먼저 정리한다. 이미 방에 들어간 뒤 취소 요청을 보내더라도 방에서 퇴장시키지는 않고 현재 방을 반환한다.

---

## 4. 2~4명 매칭 조건

```text
대기자 4명
→ 즉시 4명 매칭

대기자 2명 또는 3명
→ 가장 오래 기다린 사용자가 10초 이상 대기하면 현재 인원으로 매칭

대기자 0명 또는 1명
→ 계속 대기
```

사용자 상태 key의 TTL은 60초다. 브라우저가 상태를 조회하는 동안 TTL을 갱신한다. 비정상 종료로 취소 요청이 오지 않으면 상태 key가 만료된다.

```text
eutzza:matchmaking:queue
→ Sorted Set
→ member = userId
→ score = joinedAtMs

eutzza:matchmaking:player:{userId}
→ waiting / claimed / matched 상태 JSON
```

사용자 상태 key가 만료돼도 Sorted Set member가 자동 삭제되는 것은 아니다. 매칭 후보를 읽을 때 상태 key가 없는 member를 함께 제거한다.

---

## 5. 원자적으로 처리한 범위

다음 작업을 Node.js에서 여러 Redis 명령으로 나누면 두 서버 요청이 같은 사용자를 동시에 선택할 수 있다.

```text
대기열 읽기
→ 후보 선택
→ 후보 제거
→ claim 상태 기록
```

구현에서는 이 네 단계를 하나의 Lua script로 Redis 안에서 실행한다.

```text
Lua 실행 시작
→ 만료된 member 제거
→ 2~4명 조건 검사
→ 선택한 member를 대기열에서 제거
→ 사용자 상태를 claimed로 변경
→ Lua 실행 종료
```

Redis는 script 실행 중 다른 명령을 끼워 넣지 않으므로 두 동시 요청이 같은 대기열 member를 각각 가져가지 못한다. 같은 사용자의 최초 대기 등록도 Lua로 기존 상태 검사와 `ZADD`, `SET`을 묶어 중복 등록을 막는다.

그 뒤 현재 프로세스의 `RoomStore.createMatchedRoom()`이 선택된 참가자들로 방 하나를 만든다. 방장은 매칭 후보 중 가장 먼저 대기한 사용자다.

### 현재 다중 서버 한계

대기열은 Redis에 있지만 Room은 아직 한 Node.js 프로세스의 `Map`에 있다.

```text
Server A가 만든 Room
→ Server A의 RAM에만 존재

Server B
→ 그 Room을 알 수 없음
```

따라서 이번 구현은 단일 백엔드 인스턴스를 전제로 한다. 여러 백엔드 인스턴스로 확장하려면 Room 상태도 공유 저장소로 옮기거나, 같은 방의 요청과 WebSocket을 항상 같은 서버로 보내는 전략과 장애 복구 방식을 함께 설계해야 한다.

---

## 6. 결과 제출의 멱등성

멱등성이란 같은 요청을 여러 번 실행해도 최종 상태가 한 번 실행한 것과 같게 유지되는 성질이다.

```text
서버가 PostgreSQL에 결과 저장 성공
→ 응답이 네트워크에서 유실
→ 클라이언트가 동일 요청 재전송
```

이 경우 결과 row를 하나 더 만들거나 무조건 실패시키지 않는다.

```text
같은 gamePlayerId 결과가 이미 존재
        ↓
score, 판정 개수, maxCombo 전체 비교
        ├── 모두 같음: 기존 저장 결과를 성공 응답
        └── 하나라도 다름: 409 Conflict
```

솔로 결과 완료는 경기 row를 `FOR UPDATE`로 잠근 뒤 처리한다. 동시에 같은 완료 요청이 와도 뒤 요청은 앞 transaction이 끝난 다음 완료된 경기와 기존 점수를 확인한다.

애플리케이션의 사전 검사만으로 모든 race condition을 막을 수는 없다. PostgreSQL의 `UNIQUE(scores.game_player_id)` 제약 조건이 한 참가자에 점수 row가 둘 생기지 않게 하는 최종 방어선이다.

---

## 7. 장애별 결과

| 상황 | 결과 |
|---|---|
| Redis 랭킹 key 만료 | PostgreSQL 집계 후 Redis 재구성 |
| Redis 연결 실패 중 랭킹 조회 | PostgreSQL에서 조회해 정상 응답 |
| PostgreSQL 저장 성공 후 Redis 갱신 실패 | 영속 결과 성공 유지, Redis 오류 기록 |
| Redis 중단 중 자동 매칭 요청 | `503 Service Unavailable` |
| Node.js 재시작 | RoomStore의 방은 소멸 |
| Redis 사용자 상태 TTL 만료 | 상태 key 소멸, 다음 후보 검사에서 queue member 정리 |
| 동일 결과 재전송 | 기존 성공 결과 반환 |
| 다른 결과 재전송 | `409 Conflict` |

Leaderboard는 PostgreSQL에서 복구할 수 있는 캐시지만, 자동 매칭 상태는 짧게 살아 있는 임시 상태다. Redis가 중단되면 진행 중이던 대기열을 영구 복구하려고 하지 않고 다시 참가하도록 한다.

---

## 8. 검증한 범위

외부 Redis 프로세스를 이용한 수동 실험은 시간상 생략하고 다음 자동 검증을 추가했다.

- 2명, 3명, 4명 매칭이 각각 방 하나를 생성한다.
- 같은 사용자의 매칭 참가 재시도가 중복 상태를 만들지 않는다.
- 매칭 취소 후 상태가 `idle`이 된다.
- RoomStore가 2~4명 정원과 고유 사용자를 검사한다.
- 동점이 `1, 1, 3` 순위로 계산된다.
- 랭킹은 상위 10명만 반환한다.
- 같은 결과와 다른 결과를 모든 필드로 구분한다.
- 기존 방, WebSocket heartbeat, 멀티플레이 순위 테스트가 계속 통과한다.

Redis 명령 자체의 연결 검증은 실제 Redis 서버가 준비된 실행 환경에서 API를 호출해 추가로 확인할 수 있다.
