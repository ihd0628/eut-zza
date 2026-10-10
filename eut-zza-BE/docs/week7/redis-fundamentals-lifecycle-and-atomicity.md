# Redis 기초, 데이터 생명주기, 원자성

## 이 문서의 목표

Redis를 단순히 빠른 데이터베이스라고 외우지 않고 다음 내용을 이해한다.

- Redis가 Node.js 라이브러리가 아니라 별도 서버 프로세스라는 의미
- JavaScript `Map`, Redis, PostgreSQL의 역할 차이
- Redis key, TTL, Sorted Set의 동작
- Redis Leaderboard와 PostgreSQL Source of Truth의 관계
- TTL만으로 관련 상태의 정합성이 보장되지 않는 이유
- 원자적 작업과 Race Condition

---

## 1. Redis는 별도 서버 프로세스다

Redis는 데이터를 주로 RAM에 보관하고 Redis 명령으로 읽고 변경하는 데이터 저장 서버다.

```text
Fastify / Node.js Process
          │
          │ Redis Protocol over TCP
          ↓
Redis Process
          │
          ↓
Redis가 관리하는 Memory
```

Node.js에서 사용하는 Redis 패키지는 Redis 서버 자체가 아니라 Redis 서버에 연결하여 명령을 보내는 클라이언트다.

```text
node-postgres package
→ PostgreSQL Server에 연결하는 client

redis package
→ Redis Server에 연결하는 client
```

같은 컴퓨터에서 실행할 때는 일반적으로 loopback 주소인 `127.0.0.1`을 통해 TCP 연결할 수 있다. 실제 외부 네트워크로 나가지는 않지만 TCP/IP와 Socket 통신은 사용한다. 환경에 따라 Unix Domain Socket 같은 다른 프로세스 통신 방식도 가능하다.

서로 다른 프로세스가 항상 TCP로만 통신해야 하는 것은 아니다. Redis가 클라이언트·서버 프로토콜을 제공하며 일반적으로 TCP를 사용하는 것이다.

---

## 2. JavaScript `Map`과 Redis

현재 읏짜의 Room 정보는 Node.js 프로세스의 JavaScript Heap에 있는 `Map`에 보관된다.

```text
Node.js Process
└── JavaScript Heap
    └── Room Map
```

Node.js 프로세스가 종료되면 Heap과 Map도 사라진다.

Redis는 별도 프로세스이므로 Node.js만 재시작해도 Redis 프로세스가 계속 실행 중이라면 Redis 상태는 함께 사라지지 않는다.

```text
Node.js 종료
→ Node.js Map 제거

Redis 계속 실행
→ Redis 상태 유지 가능
```

Redis 프로세스까지 종료됐을 때의 데이터 복구 여부는 Redis의 persistence 설정에 따라 달라진다. 별도 프로세스라는 사실만으로 Redis 재시작 후 데이터가 반드시 보존되는 것은 아니다.

### 서버 프로세스가 여러 개일 때

```text
Node Server A
└── Map A

Node Server B
└── Map B
```

각 프로세스의 Map은 서로 다른 메모리이므로 자동으로 공유되지 않는다.

Redis를 사용하면 여러 서버가 같은 Redis 서버에 명령을 보낼 수 있다.

```text
Node Server A ──┐
                ├── Redis Server
Node Server B ──┘
```

여러 Node.js 프로세스가 Redis의 RAM 주소를 직접 공유하는 것은 아니다. Redis 프로세스가 자신의 메모리를 소유하고, 각 서버는 Redis 명령을 통해 동일한 논리적 상태에 접근한다.

```text
SET key value
GET key
ZADD key score member
```

---

## 3. `Map`, Redis, PostgreSQL의 역할

| 구분 | JavaScript `Map` | Redis | PostgreSQL |
|---|---|---|---|
| 실행 위치 | Node.js 프로세스 내부 | 별도 Redis 프로세스 | 별도 PostgreSQL 프로세스 |
| 주 저장 위치 | Node.js Heap | 주로 RAM | 영속 저장장치와 DB Buffer |
| 접근 방식 | JavaScript 함수 호출 | Redis 명령 | SQL |
| 여러 서버의 공유 | 불가능 | 같은 Redis에 연결하면 가능 | 같은 DB에 연결하면 가능 |
| Node.js 재시작 영향 | 제거됨 | Redis가 살아 있으면 유지 가능 | DB가 살아 있으면 유지 |
| 주요 용도 | 한 프로세스의 빠른 임시 상태 | 공유 임시 상태, 캐시, TTL, 순위 | 영속 데이터, 관계, JOIN, 제약 조건 |

같은 Node.js 프로세스 안에서만 사용할 데이터라면 Map 접근이 가장 직접적이고 Redis 네트워크 왕복보다 빠를 수 있다.

Redis는 Map보다 무조건 빠르기 때문에 선택하는 것이 아니다. 여러 프로세스가 동일한 상태에 접근하고 Redis의 자료구조, TTL, 원자적 명령을 사용하기 위해 선택한다.

읏짜에서는 다음 역할을 계획한다.

```text
PostgreSQL
├── 사용자
├── 곡과 채보
├── 경기와 참가 정보
└── 영구 점수 기록

Redis
├── 자동 매칭 대기열
├── 사용자의 짧은 매칭 상태
└── 빠른 Leaderboard 조회
```

---

## 4. Key와 Value

Redis는 key를 이용해 데이터를 찾는다.

```text
key → value
```

기본 명령:

```redis
SET eutzza:user:1:name "seunghoon"
GET eutzza:user:1:name
DEL eutzza:user:1:name
```

Redis key는 문자열이다. Value는 단순 문자열뿐 아니라 여러 자료구조가 될 수 있다.

- String
- Hash
- List
- Set
- Sorted Set

Redis key의 `:`는 실제 폴더를 만드는 문법이 아니라 사람이 구조를 알아보기 쉽게 사용하는 이름 규칙이다.

```text
애플리케이션:기능:식별자
```

읏짜 예시:

```text
eutzza:matchmaking:queue
eutzza:matchmaking:player:{userId}
eutzza:leaderboard:{songId}:{difficulty}
```

---

## 5. TTL과 데이터 생명주기

TTL은 Time To Live의 약자로 key가 살아 있을 시간을 뜻한다.

```redis
SET eutzza:matchmaking:player:1 waiting EX 30
```

이 key는 약 30초 후 만료된다.

매칭 중 브라우저가 비정상 종료되어 취소 요청을 보내지 못하더라도 대기 상태가 영원히 남는 것을 막는 보조 장치로 사용할 수 있다.

### TTL이 관련 데이터를 모두 정리하지는 않는다

다음 두 데이터가 있다고 하자.

```text
사용자 상태 key:
eutzza:matchmaking:player:user-1 → waiting

공용 대기열 Sorted Set:
eutzza:matchmaking:queue
└── user-1
```

사용자 상태 key의 TTL이 끝나도 Redis는 Sorted Set 내부의 `user-1` member를 자동으로 찾아 제거하지 않는다.

```text
player:user-1 key
→ TTL 만료로 삭제

matchmaking:queue의 user-1 member
→ 그대로 남을 수 있음
```

이렇게 실제로는 대기하지 않는 사용자가 대기열에 남은 데이터를 stale data라고 볼 수 있다.

일반적인 key TTL은 Sorted Set 전체 key에는 설정할 수 있지만 Sorted Set 내부 member 하나마다 독립적으로 설정하는 방식은 아니다. 대기 만료 시각을 Sorted Set score로 넣고 애플리케이션이 만료된 member를 찾아 제거하는 등의 설계가 필요하다.

```text
member = userId
score = 대기 만료 시각

현재 시각보다 score가 작은 member
→ 만료된 대기자
→ 대기열에서 제거
```

TTL은 자신이 설정된 key의 생명주기를 관리할 뿐 관련된 모든 key를 비즈니스 규칙에 맞게 함께 정리하거나 여러 변경을 하나의 작업으로 묶어주지는 않는다.

---

## 6. Redis Leaderboard

Leaderboard는 사용자 순위표다. Redis에서는 Sorted Set으로 구현할 수 있다.

Sorted Set은 고유한 member와 정렬에 사용할 숫자 score를 함께 저장한다.

```text
Redis key:
eutzza:leaderboard:1:normal

member = userId
score = bestScore
```

예시:

```redis
ZADD eutzza:leaderboard:1:normal 970000 user-1
ZADD eutzza:leaderboard:1:normal 990000 user-2
ZADD eutzza:leaderboard:1:normal 950000 user-3
```

높은 점수순 상위 10명을 조회하는 개념적인 명령은 다음과 같다.

```redis
ZREVRANGE eutzza:leaderboard:1:normal 0 9 WITHSCORES
```

결과:

```text
1. user-2 990000
2. user-1 970000
3. user-3 950000
```

Redis의 Sorted Set은 점수순 정렬과 특정 member의 순위 조회에 적합하다. 다만 같은 점수를 가진 사용자에게 서비스 화면에서 같은 등수를 표시할지는 애플리케이션 규칙으로 별도 처리해야 한다.

---

## 7. PostgreSQL이 Source of Truth다

Source of Truth는 데이터의 최종 원본으로 인정하는 저장소다.

```text
PostgreSQL scores
→ 모든 영구 경기 결과 보관

Redis Leaderboard
→ PostgreSQL 결과에서 계산한 사용자별 최고 점수
→ 빠른 순위 조회를 위한 파생 데이터
```

Redis Leaderboard가 사라져도 PostgreSQL의 원본 결과에서 사용자별 최고 점수를 다시 계산할 수 있어야 한다.

```text
PostgreSQL 결과 조회
→ 사용자별 MAX(score) 계산
→ Redis Sorted Set 재생성
```

Redis에 데이터가 있다는 이유로 PostgreSQL 원본 점수를 제거하지 않는다.

---

## 8. 원자적 작업

원자적 작업은 하나의 작업이 더 작은 중간 단계로 나뉘어 다른 작업에 관찰되거나, 다른 작업이 그 중간에 끼어들 수 없도록 처리되는 실행 단위다.

쉽게 말하면 다음 두 성질과 연결된다.

```text
다른 작업이 중간에 끼어들지 않는다.

전체 작업이 부분 완료 상태를 남기지 않도록 설계한다.
```

PostgreSQL Transaction에서 배운 Atomicity는 여러 변경이 모두 성공하거나 실패하면 모두 취소하는 All or Nothing을 의미한다.

Redis에서는 개별 명령 하나가 원자적으로 실행된다.

```redis
INCR eutzza:counter
```

두 요청이 동시에 `INCR`을 실행하더라도 각 명령 사이에 다른 명령의 일부가 끼어들지 않는다.

```text
초기값 0

요청 A: INCR → 1
요청 B: INCR → 2

최종값 2
```

---

## 9. Race Condition

원자적인 명령 대신 읽기와 저장을 나누면 동시에 실행된 작업이 서로의 결과를 덮어쓸 수 있다.

```text
초기 score = 10

Server A: GET → 10
Server B: GET → 10

Server A: SET 11
Server B: SET 11

예상 결과: 12
실제 결과: 11
```

실행 순서에 따라 결과가 달라지는 이런 문제를 Race Condition이라고 한다.

Redis의 개별 명령이 원자적이라는 사실이 Node.js에서 호출한 여러 명령 전체까지 자동으로 원자적으로 만들어주지는 않는다.

```ts
await redis.del(playerStatusKey);
await redis.zRem(queueKey, userId);
```

두 명령 사이에 다른 요청이 실행되거나 Node.js 프로세스가 종료되면 사용자 상태는 삭제됐지만 대기열 member는 남는 불일치가 생길 수 있다.

---

## 10. 자동 매칭에서의 원자성

매칭 작업은 다음 단계를 포함할 수 있다.

```text
1. 대기열 인원 확인
2. 참가자 2~4명 선택
3. 선택된 참가자를 대기열에서 제거
4. 참가자들의 상태를 matched로 변경
5. 같은 Room에 연결
```

두 Worker가 동시에 실행하면 같은 사용자를 각각 다른 방에 배정할 수 있다.

```text
Worker 1: A, B, C, D 선택
Worker 2: A, B, C, D 선택

Worker 1: Room 1에 배정
Worker 2: Room 2에 배정
```

대기열 확인, 참가자 선택, 제거, 매칭 상태 기록 중 필요한 범위를 하나의 원자적 실행 단위로 묶어야 한다.

가능한 도구:

- 문제를 하나의 Redis 명령으로 해결
- Redis Transaction
- `WATCH`를 사용한 낙관적 동시성 제어
- Lua Script로 검사와 변경을 Redis 안에서 함께 실행

Redis의 `MULTI/EXEC`는 명령을 연속으로 실행하게 하지만 PostgreSQL Transaction처럼 실행 중 오류가 발생했을 때 이미 실행된 모든 명령을 일반적으로 자동 Rollback하는 것과는 의미가 다르다. 구체적인 도구는 자동 매칭을 구현할 때 작업의 실패 조건과 함께 선택한다.

---

## 11. 읏짜에 적용할 원칙

```text
영구 경기 결과
→ PostgreSQL에 먼저 저장

빠른 순위 조회
→ Redis Sorted Set 사용

Redis Leaderboard 유실
→ PostgreSQL로 재구성

매칭 대기 상태
→ Redis에 짧게 저장

만료된 사용자
→ TTL만 믿지 않고 대기열에서도 정리

동시 매칭
→ 한 사용자가 두 방에 배정되지 않도록 원자적으로 처리
```

현재 Room 상태는 한 Node.js 프로세스의 Map에 있다. WEEK7의 자동 매칭은 단일 백엔드 인스턴스에서 기존 Room 흐름에 연결한다. 서버가 여러 인스턴스로 늘어나면 매칭만 Redis에 있고 Room은 각 프로세스 Map에 존재하는 구조로는 일관된 방 상태를 제공할 수 없으므로 Room 상태의 공유 전략도 별도로 필요하다.

---

## 최종 정리

- Redis는 별도 프로세스에서 자신의 메모리를 관리하는 데이터 저장 서버다.
- Node.js 프로세스들은 Redis의 RAM을 직접 공유하지 않고 Redis 명령으로 동일한 논리적 상태에 접근한다.
- Map은 한 프로세스의 상태, Redis는 여러 프로세스가 접근할 수 있는 공유 상태, PostgreSQL은 영속 원본 데이터에 적합하다.
- Redis Leaderboard는 Sorted Set으로 사용자 최고 점수와 순위를 빠르게 조회하는 파생 데이터다.
- PostgreSQL이 경기 결과의 Source of Truth이며 Redis 데이터는 다시 만들 수 있어야 한다.
- TTL은 설정된 key만 만료시키며 관련 key와 Sorted Set member를 자동으로 정리하지 않는다.
- 개별 Redis 명령은 원자적이지만 여러 명령의 연속 호출 전체가 자동으로 원자적이지는 않다.
- 자동 매칭에서는 Race Condition으로 같은 사용자가 여러 방에 배정되지 않도록 검사와 상태 변경을 필요한 범위에서 원자적으로 처리해야 한다.

