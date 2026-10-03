# 11주 개발 역량 강화 계획

## React 개발자에서 AI 시대의 Web Software Engineer로

**기간:** 2026년 8월 25일 ~ 2026년 11월 12일  
**프로젝트:** 솔로 플레이와 방당 최대 4명의 온라인 멀티플레이 대전을 지원하는 키보드 리듬게임 eut-zza(읏짜)

**권장 학습 시간:** 주 15시간 전후  
**핵심 목표:** 프론트엔드라는 강점을 유지하면서 웹 시스템 전체를 이해하고, AI Agent를 실제 개발 프로세스에 활용할 수 있는 엔지니어로 확장한다.

---

# 0. 최종 목표

11월 12일의 목표는 단순히 게임 하나를 완성하는 것이 아니다.

다음 질문에 답하고 실제로 구현할 수 있는 상태를 목표로 한다.

- 브라우저가 JavaScript와 화면을 어떻게 실행하고 렌더링하는지 설명할 수 있는가?
- React rendering과 브라우저 rendering의 차이를 설명할 수 있는가?
- 리듬게임의 정확한 timing loop를 React state에 의존하지 않고 설계할 수 있는가?
- HTTP 요청이 브라우저에서 서버까지 어떻게 전달되는지 설명할 수 있는가?
- Node.js 서버가 요청을 처리하는 과정을 설명할 수 있는가?
- PostgreSQL의 index, transaction, isolation, lock이 왜 필요한지 설명할 수 있는가?
- WebSocket을 이용해 실시간 게임 상태를 전달할 수 있는가?
- latency가 있는 환경에서 client와 server의 책임을 구분할 수 있는가?
- Redis를 matchmaking과 leaderboard에 활용할 수 있는가?
- Docker와 AWS를 이용해 서비스를 실제 인터넷에 배포할 수 있는가?
- 테스트와 CI로 코드의 invariant를 자동 검증할 수 있는가?
- AI Agent에게 기능 구현을 위임하고 결과를 검증할 수 있는가?
- AI Agent가 안정적으로 작업할 수 있도록 repository와 validation harness를 설계할 수 있는가?

---

# 1. 사용할 기술

## Frontend

```text
React
TypeScript
Vite

Canvas 2D
Web Audio API

TanStack Query
Zustand
```

React는 게임 엔진 자체보다 애플리케이션 UI를 담당한다.

```text
React
├── 로그인
├── 모드 선택 (솔로 / 멀티플레이)
├── 곡·난이도 선택
├── 방 목록·생성·입장
├── 대기실
├── 결과 화면
├── 랭킹
└── 설정

Game Engine
├── Game Loop
├── Timing
├── Input
├── Judgment
├── Score
└── Canvas Rendering
```

---

## Backend

```text
Node.js
TypeScript
Fastify
WebSocket
```

---

## Database

```text
PostgreSQL
Redis
```

---

## Infrastructure

```text
Docker
GitHub Actions
AWS
```

---

# 2. 프로젝트 최종 형태

## 기본 게임

4개의 키를 사용하는 리듬게임을 만든다.

```text
D    F    J    K
```

판정:

```text
PERFECT
GREAT
GOOD
MISS
```

게임 상태:

```text
Score
Combo
Max Combo
Accuracy
HP
Fever Gauge
```

---

## 플레이 모드와 화면 흐름

로그인하면 솔로 플레이와 멀티플레이를 선택하는 화면을 제공한다.
멀티플레이 방의 정원은 방장을 포함해 최대 4명이며, 2~4명이 함께 대전할 수 있다.
4명이 모두 모여야만 시작할 수 있는 방식으로 제한하지 않는다.
방을 만든 사용자가 방장이 되며, 방장만 곡과 난이도를 선택하거나 변경할 수 있다.

```text
로그인
└── 모드 선택
    ├── 솔로 플레이
    │   └── 곡·난이도 선택 → 혼자 플레이 → 결과·개인 기록 저장
    └── 멀티플레이
        └── 방 목록 → 방 생성 또는 입장 → 대기실
            → 방장이 곡·난이도 확정 → 참가자 준비 → 함께 시작
            → 2~4명 대결 → 참가자별 결과·순위 표시 및 개인 기록 저장
```

솔로와 멀티플레이는 노트 처리·판정·점수 계산을 담당하는 GameEngine을 공유한다.
React와 서버가 모드별 화면 흐름, 경기 생성, 시작·종료 조건을 연결한다.

멀티플레이의 기본 진입 방식은 방 목록에서 직접 방을 생성하거나 선택해 입장하는 것이다.
Week 7의 자동 매칭은 추가 진입 방식이며, 매칭 후 같은 방·경기 흐름으로 연결한다.

멀티플레이 중에는 실시간으로 다른 참가자들(최대 3명)의 다음 정보를 확인한다.

```text
Score
Combo
HP
Fever
Game Progress
```

## 방과 경기 한 판의 구분

- **방(Room):** 참가자들이 모여 준비하는 공간이다. 방 생성자가 방장이 되어 곡·난이도를 정하며, 같은 방에서 여러 판을 진행할 수 있다.
- **경기(game_sessions):** 특정 채보로 진행하는 한 번의 플레이다. 솔로도 경기 하나를 생성한다.
- **참가 정보(game_players):** 해당 경기에 참가한 사용자 한 명의 정보다.
- **개인 결과(scores):** 참가 정보 하나에 연결되는 최종 점수·판정 횟수·최대 콤보다.

| 항목 | 솔로 한 판 | 멀티플레이 한 판 |
| --- | --- | --- |
| 방 | 불필요 | 최대 4명이 같은 방에 모인다. |
| game_sessions | 경기 1개 | 2~4명의 참가자가 공유하는 경기 1개 |
| game_players | 참가 정보 1개 | 참가자별 정보, 총 2~4개 |
| scores | 개인 결과 1개 | 참가자별 개인 결과 |

경기에는 `solo` / `multiplayer` 모드를 명시한다. 모드 필드는 Week 5 통합 단계에서 추가하며,
참가자 수만으로 모드를 추측하지 않는다. 실제 방 상태 관리는 Week 6에서 구현한다.

멀티플레이의 경기 생성과 시작은 서버가 조정한다. 참가자 브라우저들이 각각 별개의 경기를 생성하면 안 된다.
같은 방에서 재대결할 때는 새로운 `gameSessionId`와 참가자별 `gamePlayerId`를 생성한다.
개인의 결과 제출과 경기 전체 종료를 구분하며, 한 명의 제출만으로 전체 경기를 완료 처리하지 않는다.

## 결과와 기록 정책

- 두 모드 모두 개인 점수·판정 횟수·최대 콤보 등 최종 플레이 결과를 저장한다.
- 멀티플레이에서는 서버가 모든 참가자의 최종 결과를 비교해 순위와 우승자를 전달한다. 동점 처리 규칙은 Week 6에서 정한다.
- 결과 화면에는 순위·우승 여부를 표시하지만, 별도의 승패 기록이나 누적 승·패 전적은 저장하지 않는다.
- 동일 경기의 참가자별 점수가 남으므로, 저장된 점수와 동점 처리 규칙으로 순위를 다시 계산하는 것은 가능하다.

---

## 후반 확장 기능

시간이 허용된다면 다음을 추가한다.

```text
Fever Mode

Battle Skill

로그라이크 능력 선택

Tier / Rating

Tournament
```

단, 이것들은 핵심 학습 목표보다 우선하지 않는다.

---

# 3. 학습 원칙

## 원칙 1 — 하나의 프로젝트만 만든다

11주 동안 새로운 사이드 프로젝트를 만들지 않는다.

모든 학습 내용을 리듬게임에 적용한다.

---

## 원칙 2 — 기능보다 원리를 우선한다

예를 들어 WebSocket을 사용할 때 목표는

> WebSocket API 사용법을 안다.

가 아니다.

다음을 이해해야 한다.

```text
HTTP Upgrade
Persistent Connection
Connection Lifecycle
Heartbeat
Disconnect
Reconnect
Broadcast
Server State
```

---

## 원칙 3 — AI에게 먼저 답을 맡기지 않는다

새로운 문제를 만났을 때 순서를 지킨다.

```text
1. 문제를 직접 분석한다.

2. 예상 해결책을 작성한다.

3. AI에게 공격적으로 리뷰하게 한다.

4. AI의 대안을 검토한다.

5. 직접 판단한다.

6. 필요하면 구현을 Agent에게 맡긴다.
```

목적은 AI 의존이 아니라 **AI를 이용한 사고 증폭**이다.

---

## 원칙 4 — 라이브러리보다 시스템을 공부한다

예를 들어 ORM 사용법보다 먼저 다음을 공부한다.

```text
SQL
Index
Transaction
Lock
MVCC
```

NestJS를 배우기 전에 다음을 이해한다.

```text
HTTP
Node.js HTTP Server
Request
Response
Stream
Connection
```

---

## 주간 완료 조건 관리

- 주간 완료 조건은 학습과 구현을 마치고 검증까지 통과한 뒤에만 `[x]`로 변경한다.
- 완료한 작업을 커밋할 때 관련 체크리스트 변경도 같은 커밋에 포함한다.
- 완료 여부를 확신할 수 없거나 검증하지 않은 항목은 `[ ]`로 유지한다.

---

# WEEK 1

## 8월 25일 ~ 8월 31일

# JavaScript Runtime + 게임 엔진의 기반

## 학습 목표

기존에 공부했던 JavaScript의 실행 모델을 하나의 구조로 연결한다.

### 반드시 이해할 것

```text
Execution Context

Lexical Environment

Environment Record

Scope Chain

Closure

Call Stack

Heap

Promise

Event Loop

Task

Microtask

async / await

requestAnimationFrame

performance.now()
```

특히 다음 흐름을 설명할 수 있어야 한다.

```text
async function
↓
await
↓
Promise
↓
현재 실행 중단
↓
Call Stack 반환
↓
Promise settle
↓
Microtask enqueue
↓
Continuation 실행
```

---

## 프로젝트 구현

### Game Engine skeleton

React 외부에 게임 엔진을 만든다.

```text
src/
├── game/
│   ├── GameEngine.ts
│   ├── GameLoop.ts
│   ├── InputManager.ts
│   └── types.ts
│
└── components/
```

게임 루프:

```text
requestAnimationFrame
↓
현재 시간 계산
↓
게임 상태 update
↓
render
↓
requestAnimationFrame
```

---

## 실험

다음을 직접 비교한다.

```text
setInterval
setTimeout
requestAnimationFrame
```

CPU에 부하를 준 상태에서도 timer가 얼마나 밀리는지 측정한다.

---

## 주간 완료 조건

- [x] Event Loop를 그림 없이 설명할 수 있다.
- [x] Task와 Microtask 차이를 설명할 수 있다.
- [x] `await` 이후 코드가 언제 실행되는지 설명할 수 있다.
- [x] `requestAnimationFrame` 기반 game loop를 구현했다.
- [x] React render와 game loop를 분리했다.

---

# WEEK 2

## 9월 1일 ~ 9월 7일

# Browser Rendering + Web Audio + Rhythm Timing

이번 주는 프로젝트에서 가장 중요한 프론트엔드 주차다.

---

## 학습 목표

### Browser Rendering Pipeline

```text
HTML Parsing
↓
DOM

CSS Parsing
↓
CSSOM

DOM + CSSOM
↓
Style Calculation + Render/Layout Tree 구성
↓
Layout
↓
Paint
↓
Rasterization
↓
Composite
```

위 흐름은 브라우저 렌더링을 이해하기 위한 단순화된 모델이다.
Style Calculation은 DOM 요소에 CSS 규칙을 적용해 computed style을 계산하고,
렌더링과 배치에 필요한 Render/Layout Tree를 구성하거나 갱신하는 과정과 밀접하게 연결된다.
현대 브라우저의 구체적인 내부 단계와 자료구조는 구현에 따라 더 세분화될 수 있으며,
화면 갱신마다 위의 모든 단계를 반드시 다시 수행하는 것은 아니다.

그리고 다음 개념을 이해한다.

```text
Main Thread

Compositor Thread

Renderer Process

GPU

Layout Thrashing

Reflow

Repaint
```

---

## Web Audio API

음악 시간을 JavaScript timer가 아니라 AudioContext clock을 중심으로 처리한다.

핵심 개념:

```text
AudioContext

currentTime

AudioBuffer

AudioBufferSourceNode

Audio Scheduling
```

---

## 핵심 설계

노트의 위치를 저장하지 않는다.

예를 들어

```text
현재 위치 = (현재 음악 시간 - 노트 시간) × 속도
```

처럼 **시간에서 위치를 계산한다.**

즉:

```text
Position = f(Time)
```

로 설계한다.

그래야 frame drop이 발생해도 게임 시간이 틀어지지 않는다.

---

## 프로젝트 구현

```text
음악 재생

Beatmap

Note 생성

Canvas 렌더링

Keyboard input

Judgment
```

판정 예:

```text
±30ms   PERFECT

±70ms   GREAT

±120ms  GOOD

그 이상   MISS
```

수치는 이후 조정한다.

---

## 주간 완료 조건

- [x] Canvas에 노트가 내려온다.
- [x] D/F/J/K 입력을 받을 수 있다.
- [x] Web Audio clock을 기준으로 판정한다.
- [x] PERFECT/GREAT/GOOD/MISS가 구현됐다.
- [x] 60Hz/120Hz에 따라 게임 판정이 달라지지 않는다.
- [x] React가 여러 번 렌더링되어도 음악 timing은 영향을 받지 않는다.

---

# WEEK 3

## 9월 8일 ~ 9월 14일

# HTTP + Network + Node.js

이제 브라우저 밖으로 나간다.

---

## 학습 목표

다음 흐름을 설명할 수 있어야 한다.

```text
https://game.example.com 입력

↓

DNS

↓

TCP Connection

↓

TLS Handshake

↓

HTTP Request

↓

Reverse Proxy

↓

Node.js Server

↓

HTTP Response
```

---

## HTTP

집중해서 볼 것:

```text
Method

Status Code

Header

Body

Cookie

Cache-Control

ETag

Authorization

CORS

Same-Origin Policy
```

그리고:

```text
HTTP/1.1
HTTP/2
HTTP/3
```

의 구조적 차이를 이해한다.

---

## Node.js

Fastify부터 시작하지 않는다.

먼저:

```ts
import http from "node:http";
```

로 직접 서버를 만든다.

확인할 것:

```text
IncomingMessage

ServerResponse

Request Stream

Response Stream

Connection
```

이후 Fastify로 이동한다.

---

## 프로젝트 구현

```text
GET /health

POST /auth/signup

POST /auth/login

GET /songs

GET /songs/:id
```

---

## 주간 완료 조건

- [x] URL 입력부터 HTTP response까지 설명할 수 있다.
- [x] Node.js 기본 HTTP server를 직접 만들었다.
- [x] Fastify를 이용한 REST API를 만들었다.
- [x] Browser → API Server 흐름을 이해한다.
- [x] CORS가 왜 존재하는지 설명할 수 있다.

---

# WEEK 4

## 9월 15일 ~ 9월 21일

# PostgreSQL

이번 계획에서 가장 중요한 주차 중 하나다.

---

## ORM 사용 금지

처음에는 SQL을 직접 작성한다.

```sql
SELECT
INSERT
UPDATE
DELETE

JOIN

GROUP BY

ORDER BY

LIMIT
```

---

## 데이터 모델

예:

```text
users

songs

beatmaps

scores

game_sessions

game_players
```

---

## 반드시 이해할 것

```text
Primary Key

Foreign Key

Unique Constraint

Index

B-Tree

Composite Index

Query Planner

EXPLAIN

Transaction

ACID

MVCC

Isolation Level

Row Lock
```

---

## 실험

PostgreSQL client 두 개를 연다.

```text
Session A
Session B
```

동일한 row를 동시에 수정하면서 lock과 transaction 동작을 관찰한다.

---

## 프로젝트 구현

게임 결과 저장:

```http
POST /scores
```

조회:

```http
GET /songs/:id/ranking

GET /users/:id/scores
```

---

## 주간 완료 조건

- [x] JOIN을 직접 작성할 수 있다.
- [x] Index가 왜 조회를 빠르게 만드는지 설명할 수 있다.
- [x] B-Tree의 기본 구조를 설명할 수 있다.
- [x] `EXPLAIN`을 읽어봤다.
- [x] Transaction을 직접 실험했다.
- [x] MVCC가 왜 필요한지 설명할 수 있다.

2026년 9월 21일 학습·실험과 결과 저장·랭킹·경기 기록 API 확인을 마쳤다.
상세 내용과 검증 범위는 [Week 4 학습 기록](eut-zza-BE/docs/week4/README.md)에 정리했다.

---

# WEEK 5

## 9월 22일 ~ 9월 28일

# 서버 Architecture + Authentication

API를 단순 CRUD 구조에서 실제 application architecture로 발전시킨다.

---

## 서버 구조

```text
HTTP Request

↓

Route

↓

Validation

↓

Authentication

↓

Service

↓

Repository

↓

PostgreSQL
```

디렉터리:

```text
src/

routes/

services/

repositories/

domain/

db/
```

---

## Authentication

공부할 것:

```text
Password Hash

Session

Cookie

JWT

Access Token

Refresh Token

Authorization
```

JWT를 무조건 사용하는 것이 목표가 아니다.

각 방식의 **trust boundary**를 이해한다.

---

## 프로젝트 구현

```text
회원가입

로그인

로그아웃

내 게임 기록

내 최고 점수

사용자 프로필
```

### Week 5 통합 범위 — 솔로 플레이 완성

이 주차의 로그인 → 플레이 → 기록 저장 검증은 솔로 플레이로 수행한다.
아래 흐름을 연결하면 구현 범위를 마무리하고, 주간 학습 완료 조건도 함께 확인한다.

1. 로그인 후 솔로·멀티플레이 모드 선택 화면을 표시한다. 멀티플레이는 Week 6 구현 전까지 준비 중임을 표시한다.
2. 솔로 플레이에서 서버의 곡·난이도 목록을 조회하고, 선택한 채보와 음원으로 게임을 준비한다.
3. 인증된 사용자의 솔로 경기와 참가 정보를 서버에서 생성해 `gameSessionId`, `gamePlayerId`를 반환한다.
4. GameEngine에서 점수·판정 횟수·콤보를 계산하고, 모든 노트 처리가 끝나면 최종 결과를 전달한다.
5. 본인의 참가 정보에 결과를 저장하고 솔로 경기를 완료 처리한다. 결과 저장과 경기 상태 변경은 트랜잭션으로 묶는다.
6. 결과 화면과 내 기록·최고 점수 조회를 연결하고, 저장 성공 후 관련 Query를 갱신한다.

공통 경기·참가자·결과 모델을 사용하되, 솔로의 생성·종료 규칙을 멀티플레이에 그대로 적용하지 않는다.
방 목록·입장·준비·동시 시작·대결 결과는 Week 6의 구현 범위다.

---

## Frontend 연결

TanStack Query를 사용해

```text
Server State
```

를 관리한다.

Zustand는

```text
Client/Game State
```

에 제한적으로 사용한다.

---

## 주간 완료 조건

- [x] Route/Service/Repository 책임을 설명할 수 있다.
- [x] Authentication과 Authorization 차이를 설명할 수 있다.
- [x] Cookie와 JWT의 차이를 설명할 수 있다.
- [x] React에서 서버 상태와 클라이언트 상태를 분리했다.
- [x] 로그인 후 모드를 선택하고, 솔로 플레이에서 곡·난이도를 선택할 수 있다.
- [x] 실제 로그인 → 솔로 플레이 → 결과 저장 → 내 기록·최고 점수 조회 흐름이 동작한다.

2026년 9월 30일 솔로 플레이 전체 흐름과 내 기록·최고 점수 조회를 브라우저에서 검증했다.

---

# WEEK 6

## 9월 29일 ~ 10월 5일

# WebSocket + Real-Time Multiplayer

솔로 플레이를 유지하면서 방 기반 온라인 멀티플레이(2~4명 대전)를 추가한다.

## 진행 순서

아래 순서대로 학습·구현하고, 각 단계의 동작을 확인한 뒤 다음 단계로 넘어간다.

1. **HTTP와 WebSocket 이해:** 요청·응답과 지속 연결의 차이를 공부하고, 작은 연결 실험으로 handshake, 메시지 송수신, 연결 종료를 확인한다.
2. **방과 경기 규칙 확정:** 방장 이탈·연결 종료, 동점, 미완주, 결과 제출 시간 초과를 어떻게 처리할지 정한다. 방 상태와 경기 상태의 책임도 구분한다.
3. **방 목록·생성·입장:** 로그인한 사용자가 방을 조회·생성·입장한다. 서버가 방장을 기록하고 동시 입장 요청에도 정원 4명을 초과하지 않도록 한다.
4. **대기실 구현:** 방장만 곡·난이도를 변경하고, 참가자들이 준비 상태를 바꾼다. 서버가 권한과 시작 조건을 검사하고 변경된 상태를 방 전체에 전달한다.
5. **경기 시작 동기화:** 서버가 2~4명의 참가자를 확정하고 경기 하나와 참가자별 정보를 만든다. 모두 같은 `gameSessionId`·채보·공통 시작 시각을 받고, 각자는 서로 다른 `gamePlayerId`로 시작한다.
6. **진행 상황 공유:** 각 브라우저는 기존 GameEngine으로 게임을 실행한다. 필요한 score/combo 등만 적절한 간격으로 전송하고 다른 참가자들의 상태를 표시한다.
7. **종료·순위·기록:** 참가자별 최종 결과를 모아 서버가 경기 전체의 종료 시점, 순위, 우승자를 결정한다. 개인 결과를 저장하고 최대 4명의 결과를 표시한다.
8. **연결 종료와 통합 검증:** disconnect 감지와 reconnect 전략을 확인한다. 2명·3명·4명 플레이, 정원 초과, 방장 권한, 동점·미완주를 검증하고 솔로 플레이도 다시 확인한다.

---

## 학습 목표

```text
HTTP

vs

WebSocket
```

차이를 이해한다.

WebSocket:

```text
Handshake

Connection

Message

Broadcast

Heartbeat

Disconnect

Reconnect
```

---

## 서버 구조

```text
Player A ── WebSocket ──┐
Player B ── WebSocket ──┤
Player C ── WebSocket ──┼── Game Server (같은 Room, 최대 4명)
Player D ── WebSocket ──┘
```

---

## 구현

```text
멀티플레이 모드 선택

Room 목록

Room 생성

Room 입장 (최대 4명, 서버에서 정원 검증)

방장 권한 관리

방장의 곡·난이도 선택·변경

Player Ready (2~4명의 참가자 준비 확인)

서버가 공유 경기와 참가자별 정보 생성

Game Start (공통 시작 시각 전달)

Game Progress

Score Update

참가자별 최종 결과 수집

Game End (서버가 경기 종료 및 참가자별 순위·우승자 판정)

결과 표시·개인 기록 저장
```

서버가 방장, 방 참가자, 선택한 채보, 준비 상태, 현재 경기를 관리한다.
방을 생성한 인증 사용자를 방장으로 기록하고, 곡·난이도 변경 요청은 서버에서 방장 권한을 검사한다.
일반 참가자의 곡·난이도 변경 요청은 클라이언트 UI에서 제한하는 것과 별개로 서버에서도 거부한다.
방장이 나가거나 연결이 끊겼을 때 방을 종료할지 다른 참가자에게 방장을 넘길지는 구현 전에 규칙을 정한다.
입장이 동시에 요청되어도 정원 4명을 초과하지 않도록 서버에서 처리한다.
경기 시작 시 2~4명의 참가자를 확정하며, 모두 같은 `gameSessionId`와 채보를 사용하고 각자 자신의 `gamePlayerId`를 가진다.
개인 결과 제출과 전체 경기 완료를 구분하고, 경기 참가자 전체를 기준으로 결과 대기·연결 종료·제출 시간 초과 시의 처리 규칙을 정한다.
결과 UI는 상대 한 명과의 비교에 고정하지 않고 최대 4명의 순위를 표시한다. 동점과 미완주 참가자의 처리 규칙도 정한다.
별도의 승패 기록이나 누적 승·패 전적은 저장하지 않는다.

---

## 중요 원칙

매 프레임마다 서버에 데이터를 보내지 않는다.

예:

```text
60 FPS
×
4 players
```

식으로 network message를 발생시키면 안 된다.

전송해야 할 상태와 로컬에서 계산 가능한 상태를 구분한다.

---

## 주간 완료 조건

- [x] 멀티플레이 선택 후 방 목록을 조회하고 방을 생성하거나 입장할 수 있다.
- [ ] 방 생성자가 방장이 되고, 방장만 곡·난이도를 선택·변경할 수 있다.
- [ ] 일반 참가자의 곡·난이도 변경 요청을 서버가 권한 오류로 거부한다.
- [ ] 2명·3명·4명 각각 같은 room에 접속하고 방장이 곡·난이도를 확정한 뒤 준비·시작할 수 있다.
- [x] 4명이 있는 방에 추가 입장을 거절하고, 동시 입장 요청에도 정원을 초과하지 않는다.
- [ ] 같은 경기 ID와 서로 다른 참가자 ID로 게임 시작을 동기화할 수 있다.
- [ ] 다른 참가자들(최대 3명)의 score/combo를 실시간 확인한다.
- [ ] 서버가 전체 참가자를 기준으로 경기 종료와 순위·우승자를 판정하고, 참가자별 결과를 저장해 화면에 표시한다.
- [ ] 동점과 연결 종료·시간 초과로 미완주한 참가자의 결과 처리 규칙을 적용한다.
- [ ] 개인 결과 제출과 경기 전체 종료를 구분한다.
- [ ] 멀티플레이 추가 후에도 솔로 플레이와 기록 저장이 동작한다.
- [x] disconnect를 감지한다.
- [x] reconnect 전략을 고민했다.
- [ ] WebSocket과 HTTP의 역할을 구분할 수 있다.

---

# WEEK 7

## 10월 6일 ~ 10월 12일

# Network Latency + Redis

멀티플레이 게임에서 실제 네트워크 문제를 다룬다.

---

## 공부할 것

```text
Latency

RTT

Jitter

Packet Loss

Client Timestamp

Server Timestamp

Clock Offset

Authoritative Server

Client Prediction
```

WebSocket이 TCP 위에서 동작한다는 것도 연결해서 이해한다.

---

## Redis

공부할 것:

```text
Key/Value

TTL

Cache

Sorted Set

Atomic Operation
```

---

## 프로젝트 적용 1 — Matchmaking

방 목록에서 직접 생성·입장하는 방식을 유지하면서 자동 매칭을 추가한다.
매칭된 2~4명의 사용자는 Week 6에서 구현한 방·경기 흐름에 연결한다.
4명이 채워지지 않았을 때의 대기 시간과 매칭 확정 조건을 정하고, 2인 매칭으로 고정하지 않는다.

```text
Player A
Player B
Player C
Player D

↓

Matchmaking Queue

↓

2~4명 그룹 매칭 (최대 4명)

↓

같은 Room으로 연결 → 준비 → 함께 시작
```

---

## 프로젝트 적용 2 — Leaderboard

Redis Sorted Set을 활용한다.

```text
score → ranking
```

---

## 추가 학습

게임 결과 요청이 중복으로 들어오는 상황을 만든다.

```text
POST score

timeout

retry

POST score
```

그리고:

```text
Idempotency

Unique Constraint
```

로 해결한다.

---

## 주간 완료 조건

- [ ] 직접 방 생성·입장을 유지하면서 자동 매칭으로도 2~4명이 같은 방·경기 흐름에 진입할 수 있다.
- [ ] Redis leaderboard가 동작한다.
- [ ] RTT를 직접 측정한다.
- [ ] latency가 게임에 어떤 영향을 주는지 설명할 수 있다.
- [ ] duplicate request를 안전하게 처리할 수 있다.

---

# WEEK 8

## 10월 13일 ~ 10월 19일

# Docker + AWS + CI/CD

로컬 애플리케이션을 실제 서비스로 만든다.

---

## Docker

이해할 것:

```text
Image

Container

Layer

Dockerfile

Volume

Network

Environment Variable
```

단순 명령어 암기가 아니라:

> Container가 프로세스를 어떻게 격리하는가?

정도까지 이해한다.

---

## 배포 구조

예:

```text
Browser

↓

CloudFront

↓

Frontend Static Files
```

Backend:

```text
Internet

↓

Load Balancer / Reverse Proxy

↓

Node.js API
```

Database:

```text
PostgreSQL
Redis
```

---

## AWS

이번 기간에는 깊게 파지 않는다.

핵심:

```text
EC2

S3

CloudFront

RDS

Security Group

IAM

Route53
```

---

## CI/CD

GitHub Actions:

```text
Push

↓

Install

↓

Type Check

↓

Lint

↓

Unit Test

↓

Integration Test

↓

Build

↓

Deploy
```

---

## 주간 완료 조건

- [ ] Dockerfile을 직접 작성했다.
- [ ] Frontend와 Backend를 배포했다.
- [ ] HTTPS 도메인으로 접속할 수 있다.
- [ ] DB가 production 환경에서 동작한다.
- [ ] CI가 자동 실행된다.
- [ ] 배포 과정을 설명할 수 있다.

---

# WEEK 9

## 10월 20일 ~ 10월 26일

# Testing + Architecture

AI Agent를 본격적으로 사용하기 전에 먼저 검증 시스템을 만든다.

---

## Testing Pyramid

```text
Unit Test

Integration Test

E2E Test
```

각 테스트가 무엇을 보장해야 하는지 구분한다.

---

## Game Engine Unit Test

특히 게임 로직은 UI와 분리해서 테스트한다.

예:

```text
note = 10.000 sec
keydown = 10.018 sec

→ PERFECT
```

---

## Backend Integration Test

```text
Request

↓

Server

↓

Transaction

↓

Database

↓

Response
```

전체 흐름을 검증한다.

---

## 중요한 invariant 정의

예:

```text
score는 음수가 될 수 없다.

같은 gamePlayer의 최종 결과는 한 번만 저장된다.

같은 gameSession에는 여러 참가자의 결과가 저장될 수 있다.

멀티플레이 방의 참가자는 동시 입장 요청에도 최대 4명을 넘지 않는다.

멀티플레이 경기 시작 시 참가자는 2~4명이며, 모두 같은 gameSession을 공유한다.

확정된 개인 결과는 덮어쓸 수 없다.

멀티플레이에서 한 명의 결과 제출만으로 경기 전체를 완료 처리하지 않는다.

본인의 score만 제출할 수 있다.

판정 계산은 frame rate에 영향을 받지 않는다.
```

---

## 주간 완료 조건

- [ ] 게임 엔진 unit test가 있다.
- [ ] API integration test가 있다.
- [ ] 핵심 사용자 흐름 E2E test가 있다.
- [ ] 중요한 business invariant를 문서화했다.
- [ ] CI에서 모든 검증이 자동 수행된다.

---

# WEEK 10

## 10월 27일 ~ 11월 2일

# AI Agent + Harness Engineering

이제 AI를 단순 코드 생성기가 아니라 개발 Agent로 사용한다.

---

## 목표

다음 작업을 Agent에게 맡긴다.

```text
Issue 분석

↓

Repository 탐색

↓

Implementation Plan

↓

Code 작성

↓

Test 작성

↓

Type Check

↓

Lint

↓

Review
```

---

## Repository 문서

```text
AGENTS.md

docs/
├── architecture.md
├── frontend.md
├── backend.md
├── database.md
└── game-rules.md
```

`AGENTS.md`는 백과사전으로 만들지 않는다.

Agent가 필요한 문서를 찾을 수 있는 **지도** 역할을 한다.

---

## AI에게 맡길 기능 예제

### Fever Mode

```text
30 Combo 이상부터 Fever Gauge 증가

Gauge 100 → Fever 시작

10초 지속

Fever 동안 score ×2
```

AI에게 요구사항과 invariant만 제공하고 구현을 맡긴다.

---

## AI 결과를 평가할 것

```text
Architecture 위반 여부

불필요한 abstraction

Race Condition

Security 문제

Performance 문제

Test 누락

Edge Case
```

---

## Harness

AI가 잘못된 코드를 작성해도 자동으로 실패하게 만든다.

```text
TypeScript

↓

ESLint

↓

Architecture Rule

↓

Unit Test

↓

Integration Test

↓

E2E

↓

CI
```

---

## 주간 완료 조건

- [ ] Agent가 repository 문서를 보고 작업할 수 있다.
- [ ] 기능 하나를 Agent에게 처음부터 끝까지 맡겼다.
- [ ] Agent 코드에서 실제 문제를 직접 발견했다.
- [ ] 테스트 또는 lint가 Agent의 오류를 잡았다.
- [ ] 인간이 직접 코드를 작성하는 것과 Agent에게 위임할 작업을 구분할 수 있다.

---

# WEEK 11

## 11월 3일 ~ 11월 9일

# 최종 통합 프로젝트

마지막 주에는 새로운 기술을 공부하지 않는다.

하나의 실제 기능을 처음부터 끝까지 만든다.

---

## 추천 기능

### 최대 4인 멀티플레이 Battle Skill System

예:

```text
30 Combo

↓

Skill Charge

↓

Skill 사용

↓

정해진 대상에게 Effect
```

예:

```text
Note Speed +15%

화면 흔들림

판정선 잠시 이동

노트 일부 Fade
```

대상이 상대 한 명인지 다른 참가자 전체인지 먼저 정하고, 서버에서 대상이 같은 경기의 참가자인지 검증한다.
게임 플레이를 심각하게 망가뜨리는 기능보다는 prototype 수준으로 구현한다.

---

## 이번 주 인간의 역할

직접 코딩하는 사람이 아니라 시스템을 설계하는 사람처럼 작업한다.

```text
Requirement

↓

Domain Design

↓

Frontend Architecture

↓

Backend Architecture

↓

Protocol

↓

Database

↓

Test Strategy

↓

Agent Task 분해

↓

Implementation Review

↓

Deploy
```

---

## 주간 완료 조건

기능 하나가 다음 전체 stack을 건드려야 한다.

- [ ] React
- [ ] Game Engine
- [ ] WebSocket
- [ ] Node.js
- [ ] Database
- [ ] Test
- [ ] CI
- [ ] Production

---

# FINAL

## 11월 10일 ~ 11월 12일

# 정리 및 역량 평가

새 기능을 개발하지 않는다.

11주 동안 만든 것을 복습한다.

---

## Architecture Diagram 작성

직접 다음 전체 구조를 그린다.

```text
Browser

React

Game Engine

Canvas

Web Audio

HTTP

WebSocket

Node.js

Redis

PostgreSQL

Docker

AWS
```

각 계층의 책임을 설명한다.

---

# 최종 자기 평가

각 질문에 YES/NO로 답한다.

## JavaScript / Browser

- Execution Context와 Lexical Environment를 설명할 수 있다.
- Event Loop와 Microtask를 설명할 수 있다.
- `async/await`의 실제 실행 흐름을 설명할 수 있다.
- Browser Rendering Pipeline을 설명할 수 있다.
- React rendering과 Browser rendering을 구분할 수 있다.
- 리듬게임 timing이 frame rate에 종속되지 않도록 설계할 수 있다.

## Backend

- Node.js가 HTTP request를 처리하는 과정을 설명할 수 있다.
- WebSocket connection lifecycle을 설명할 수 있다.
- Authentication과 Authorization을 구분할 수 있다.
- API를 Route/Service/Repository 계층으로 설계할 수 있다.

## Database

- Index가 어떻게 동작하는지 설명할 수 있다.
- B-Tree의 기본 구조를 설명할 수 있다.
- Transaction이 필요한 이유를 설명할 수 있다.
- MVCC를 설명할 수 있다.
- Lock과 race condition을 이해한다.
- Query plan을 확인할 수 있다.

## Network

- DNS → TCP → TLS → HTTP 흐름을 설명할 수 있다.
- RTT와 latency를 설명할 수 있다.
- 게임에서 client/server time 문제를 이해한다.
- WebSocket과 HTTP의 역할을 구분할 수 있다.

## Infrastructure

- Docker image와 container의 차이를 설명할 수 있다.
- 서비스를 AWS에 직접 배포할 수 있다.
- DNS/HTTPS가 어떻게 연결되는지 이해한다.
- CI/CD pipeline을 만들 수 있다.

## AI Engineering

- AI에게 코드가 아니라 기능 단위 작업을 맡길 수 있다.
- Agent에게 적절한 context를 제공할 수 있다.
- Agent 결과의 architecture 문제를 발견할 수 있다.
- Agent가 잘못된 구현을 했을 때 이를 잡아낼 test/harness를 설계할 수 있다.
- Agent 친화적인 repository를 설계할 수 있다.

---

# 학습 시간 배분

주당 약 15시간을 기준으로 한다.

```text
이론       약 4시간

직접 구현  약 7시간

AI 활용    약 3시간

복습       약 1시간
```

하루 단위로는 대략:

```text
30~45분
이론 학습

↓

90~120분
직접 구현 / 실험

↓

20~30분
AI를 이용한 리뷰 및 정리
```

매일 반드시 공부할 필요는 없다.

**주간 총량과 결과물**을 기준으로 관리한다.

---

# 하지 않을 것

11월 12일까지는 다음 기술을 의도적으로 제외한다.

```text
Spring

Java

Go

Rust

Python

Kubernetes

Kafka

Microservice

GraphQL

LangChain

Vector DB

LLM Training

Transformer 수학

새로운 React 상태관리 라이브러리
```

배우지 않는 이유는 중요하지 않아서가 아니다.

**현재 목표에 대한 opportunity cost가 너무 크기 때문이다.**

---

# 이 계획의 핵심

이번 11주의 목적은

```text
React
↓
React 잘하는 사람
```

이 아니다.

목표는:

```text
             Browser
                │
JavaScript ── React ── Game Engine
                │
              HTTP
                │
              Node
                │
       ┌────────┴────────┐
   PostgreSQL          Redis
       │
             Infrastructure
                   │
                  AWS
```

이 전체 구조가 머릿속에서 하나의 시스템으로 연결되는 것이다.

그리고 그 위에:

```text
              Human Engineer
                     │
              Architecture
                     │
        ┌────────────┼────────────┐
        │            │            │
     AI Agent     AI Agent     AI Agent
        │            │            │
    Frontend      Backend       Tests
        │            │            │
        └────────────┼────────────┘
                     │
              Automated Harness
                     │
                  Production
```

라는 개발 방식을 추가한다.

---

# 11월 12일의 목표 상태

최종적으로 스스로를

> **React를 사용할 줄 아는 개발자**

라고 정의하는 것이 아니라,

> **브라우저와 JavaScript를 깊게 이해하고, React를 주특기로 사용하며, Node.js·Database·Network·Infrastructure까지 연결해서 웹 서비스를 설계할 수 있고, AI Agent에게 실제 개발 업무를 위임하고 검증할 수 있는 Software Engineer**

라고 정의할 수 있는 수준까지 올라가는 것이 이번 육아휴직 기간의 목표다.
