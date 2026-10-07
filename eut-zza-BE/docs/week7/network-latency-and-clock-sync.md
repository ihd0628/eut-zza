# 네트워크 지연과 클라이언트·서버 시각 동기화

## 이 문서의 목표

멀티플레이 게임에서는 서버가 같은 메시지를 모든 참가자에게 보내도 각 브라우저에 도착하는 시점이 다를 수 있다.

이 문서는 다음 내용을 다시 설명할 수 있도록 정리한 학습 기록이다.

- Latency, RTT, Jitter, Packet Loss의 차이
- TCP 위에서 동작하는 WebSocket이 패킷 유실을 다루는 방법
- `Date.now()`와 `performance.now()`의 차이
- 브라우저와 Node.js의 `performance.timeOrigin`
- 서로 다른 컴퓨터의 Clock Offset을 추정하는 방법
- 읏짜가 서버 기준 경기 시작 시각을 브라우저 시각으로 바꾸는 흐름

이번 학습에서는 별도의 네트워크 측정 화면이나 진단 도구를 추가하지 않는다. 현재 읏짜에 이미 존재하는 최소 시간 동기화 코드를 분석하고 계산 원리를 이해하는 것을 완료 기준으로 삼는다.

---

## 1. Latency

Latency는 데이터가 출발지에서 목적지까지 도착하는 데 걸리는 지연이다.

```text
Client ── 40ms ──> Server
```

이 예시의 클라이언트에서 서버 방향 편도 지연은 약 40ms다.

편도 Latency를 정확히 계산하려면 클라이언트가 보낸 시각과 서버가 받은 시각을 비교해야 한다. 두 시각은 서로 다른 컴퓨터에서 만들어지므로 두 컴퓨터의 Clock Offset을 먼저 알아야 한다.

실무에서는 latency라는 단어를 왕복 시간인 RTT 의미로 사용하기도 한다. 정확한 논의가 필요할 때는 편도 지연인지 RTT인지 구분한다.

---

## 2. RTT

RTT는 Round Trip Time의 약자로, 클라이언트가 메시지를 보내고 응답을 다시 받을 때까지의 왕복 시간이다.

```text
Client                         Server

요청 전송
      ───────────────────────>
                              요청 처리
      <───────────────────────
응답 수신
```

클라이언트의 같은 시계로 시작과 끝을 측정할 수 있으므로 편도 Latency보다 측정하기 쉽다.

```text
RTT = 클라이언트 수신 시각 - 클라이언트 전송 시각
```

RTT에는 순수한 네트워크 이동 시간만 포함되는 것이 아니다.

- 클라이언트가 데이터를 실제로 전송하기까지 기다린 시간
- 네트워크와 중간 라우터에서 이동하거나 대기한 시간
- 서버 이벤트 루프에서 처리를 기다린 시간
- 서버의 실제 처리 시간
- 응답이 클라이언트로 돌아오는 시간
- 브라우저 이벤트 루프가 `message` handler를 실행하기까지 기다린 시간

따라서 애플리케이션에서 측정한 RTT는 이 시간을 모두 포함한 관측값이다.

---

## 3. Jitter

Jitter는 지연 시간이 매번 일정하지 않고 흔들리는 현상이다.

```text
1회 RTT:  42ms
2회 RTT:  45ms
3회 RTT: 180ms
4회 RTT:  51ms
5회 RTT:  39ms
```

Latency가 크면 사용자 입력이나 방 상태 반영이 전반적으로 늦어진다. Jitter까지 크면 그 지연이 불규칙해져 화면을 예측하거나 부드럽게 보정하기가 더 어려워진다.

읏짜에서는 다음처럼 관찰될 수 있다.

```text
상대 점수 500

잠시 변화 없음

상대 점수 2000

다시 잠시 변화 없음

상대 점수 3500
```

상대 플레이어가 실제로 멈춘 것이 아니라 진행 메시지의 도착 간격이 흔들린 것일 수 있다.

일정한 지연도 너무 크면 문제가 된다. 다만 일정한 지연은 불규칙한 지연보다 예상하고 보정하기 쉽다.

---

## 4. Packet Loss와 TCP 재전송

Packet Loss는 전송 중 일부 네트워크 패킷이 목적지에 도착하지 않는 현상이다.

WebSocket은 TCP 위에서 동작한다. TCP는 다음 성질을 제공한다.

- 데이터 유실을 감지한다.
- 유실된 데이터를 재전송한다.
- 데이터 순서를 보장한다.
- 앞선 데이터가 복구되기 전까지 뒤의 데이터를 애플리케이션에 먼저 전달하지 않는다.

예를 들어 다음 데이터 중 B가 유실되었다고 하자.

```text
A 도착
B 유실
C 도착
```

수신 측 TCP는 자신이 받은 범위를 ACK로 알리고, 송신 측 TCP는 ACK 상태나 timeout 등을 통해 유실을 판단하여 B를 재전송한다. 이 처리는 브라우저 JavaScript가 직접 수행하는 것이 아니라 운영체제의 TCP 계층에서 일어난다.

```text
A 도착
B 유실
C 도착

송신 측이 B 재전송

B 도착

A, B, C 순서 복구

WebSocket 계층에 전달
```

따라서 WebSocket 애플리케이션에서는 패킷 유실이 주로 다음처럼 보인다.

- 메시지가 평소보다 늦게 도착한다.
- 메시지가 잠시 멈췄다가 이어진다.
- 손실이 심하면 연결이 종료된다.

애플리케이션이 순서가 뒤바뀐 TCP 데이터를 그대로 받는 것이 아니다. 앞의 데이터가 복구될 때까지 뒤의 데이터도 기다리는 현상은 Head-of-Line Blocking과 연결된다.

### WebSocket 메시지와 패킷은 같은 단위가 아니다

```text
socket.send() 한 번 ≠ TCP segment 하나
socket.send() 한 번 ≠ IP packet 하나
```

하나의 큰 WebSocket 메시지는 여러 TCP segment로 나뉠 수 있다. 작은 전송 데이터들은 네트워크에서 다르게 묶여 처리될 수도 있다. WebSocket 계층은 이 전송 과정을 거친 뒤 애플리케이션에 메시지 경계를 제공한다.

---

## 5. Client Timestamp와 Server Timestamp

클라이언트와 서버는 서로 다른 컴퓨터이므로 같은 현실의 순간에도 시스템 시각이 다를 수 있다.

```text
Client Date.now(): 10000
Server Date.now(): 10350
```

이 예시에서는 서버 시계가 클라이언트 시계보다 350ms 빠르다.

```text
Clock Offset = 서버 시계 - 클라이언트 시계
             = +350ms
```

서버 시계가 느리다면 Clock Offset은 음수가 된다.

---

## 6. `Date.now()`와 `performance.now()`

### `Date.now()`

`Date.now()`는 1970년 1월 1일부터 흐른 시간을 밀리초 단위로 반환한다.

```text
Date.now()
→ Unix epoch 기준의 절대시각
→ 브라우저와 서버가 시각 정보를 교환할 때 사용 가능
→ 운영체제 시계가 보정되면 값이 앞으로 뛰거나 뒤로 갈 수 있음
```

서로 같은 Unix epoch를 기준으로 하지만 서로 다른 컴퓨터의 시스템 시계가 정확히 일치한다는 보장은 없다.

### `performance.now()`

`performance.now()`는 현재 실행 환경의 `performance.timeOrigin`부터 흐른 시간을 반환한다. 일반적으로 뒤로 가지 않는 단조 증가 시계이므로 같은 환경 안에서 경과 시간을 측정하기에 적합하다.

```text
performance.now()
→ 현재 실행 환경의 timeOrigin 기준 상대 시간
→ RTT와 코드 실행 시간 측정에 적합
→ 서로 다른 컴퓨터의 값을 직접 비교할 수 없음
```

### 브라우저의 `performance.timeOrigin`

브라우저에서는 현재 문서를 불러오기 위한 navigation이 시작된 시점이 현재 문서의 시간 기준점이다.

```text
navigation 시작
→ performance.now() 약 0ms

5초 경과
→ performance.now() 약 5000ms
```

이는 첫 화면이 실제 픽셀로 표시된 시점과는 다르다. navigation 이후 HTML 다운로드, JavaScript 실행, React 렌더링, 브라우저 렌더링 파이프라인을 거쳐 화면이 표시되므로 첫 화면이 보일 때는 이미 시간이 흘러 있을 수 있다.

새로고침하면 새 문서와 새 time origin이 만들어진다. React Router를 통한 일반적인 SPA 내부 이동은 문서를 새로 불러오지 않으므로 같은 time origin을 유지한다.

### Node.js의 `performance.timeOrigin`

Node.js에서는 현재 Node.js 프로세스가 시작된 시점이 기준이다.

```text
Node.js 프로세스 시작
→ performance.now() 약 0ms

프로세스 실행 1시간 후
→ performance.now() 약 3,600,000ms
```

서버를 재시작하면 새 프로세스가 만들어지므로 다시 0ms 부근부터 시작한다.

브라우저는 현재 문서의 navigation 시점, Node.js는 현재 프로세스 시작 시점을 기준으로 하므로 두 환경의 `performance.now()`를 직접 비교할 수 없다.

### 읏짜에서의 역할 구분

```text
브라우저 내부 RTT 측정
→ performance.now()

게임 프레임 경과 시간
→ requestAnimationFrame timestamp 또는 performance.now()

서버가 전달하는 경기 시작 절대시각
→ 서버 Date.now() 기준 timestamp

클라이언트와 서버의 시각 차이
→ Date.now() 기반 timestamp를 교환하여 추정
```

---

## 7. Clock Offset 추정

다음 네 시각을 사용한다.

```text
t0: 클라이언트가 요청을 보낸 시각
t1: 서버가 요청을 받은 시각
t2: 서버가 응답을 보낸 시각
t3: 클라이언트가 응답을 받은 시각
```

```text
Client                          Server

t0 요청 전송
      ───────────────────────>
                                t1 요청 수신
                                t2 응답 전송
      <───────────────────────
t3 응답 수신
```

전체 측정 시간은 다음과 같다.

```text
t3 - t0
```

서버 처리 시간은 다음과 같다.

```text
t2 - t1
```

서버 처리 시간을 제외한 추정 네트워크 RTT는 다음과 같다.

```text
추정 네트워크 RTT
= (t3 - t0) - (t2 - t1)
```

Clock Offset은 다음처럼 추정할 수 있다.

```text
Clock Offset
≈ ((t1 - t0) + (t2 - t3)) / 2
```

### 계산 예시

```text
t0 = 1000
t1 = 6100
t2 = 6120
t3 = 1120
```

전체 측정 시간:

```text
1120 - 1000 = 120ms
```

서버 처리 시간:

```text
6120 - 6100 = 20ms
```

추정 네트워크 RTT:

```text
120 - 20 = 100ms
```

추정 Clock Offset:

```text
((6100 - 1000) + (6120 - 1120)) / 2
= (5100 + 5000) / 2
= 5050ms
```

서버 시계가 클라이언트 시계보다 약 5,050ms 빠르다고 추정한다.

### 정확한 값이 아니라 추정값인 이유

Clock Offset 계산은 요청과 응답의 이동 시간이 비슷하다고 가정한다.

```text
Client → Server: 50ms
Server → Client: 50ms
```

현실에서는 다음처럼 비대칭일 수 있다.

```text
Client → Server: 20ms
Server → Client: 100ms
```

클라이언트는 왕복 시간을 알 수 있지만 각 방향에 정확히 몇 ms가 사용되었는지는 알 수 없다. 따라서 Clock Offset은 추정값이다.

네트워크 지연과 이벤트 루프 대기는 매번 달라질 수 있으므로 여러 표본을 비교한다. 단순 평균은 큰 이상치 하나에 크게 영향을 받을 수 있다.

```text
Offset 표본: 98, 100, 101, 102, 2000

단순 평균: 480.2ms
중앙값:    101ms
```

이상치의 영향을 줄이기 위해 다음 방법을 고려할 수 있다.

- RTT가 지나치게 큰 표본을 제외한다.
- 가장 작은 RTT를 가진 표본의 Clock Offset을 사용한다.
- 정상 표본의 중앙값을 사용한다.
- 반복 측정하면서 최근 표본에 가중치를 주어 보정한다.

---

## 8. 현재 읏짜의 시간 동기화 흐름

읏짜에는 멀티플레이 시작을 위한 최소 시간 동기화가 이미 구현되어 있다.

### 1. WebSocket 연결 직후 요청

`eut-zza-FE/src/pages/RoomBoundary.tsx`는 방 WebSocket이 열리면 0ms, 150ms, 300ms의 간격으로 세 번 `time_sync` 메시지를 보낸다.

```json
{
  "type": "time_sync",
  "clientSentAtMs": 10000
}
```

### 2. 서버 응답

`eut-zza-BE/src/routes/room-websocket-routes.ts`는 클라이언트가 보낸 시각과 서버의 현재 시각을 돌려준다.

```json
{
  "type": "time_sync",
  "clientSentAtMs": 10000,
  "serverTimeMs": 15050
}
```

### 3. 클라이언트 계산

클라이언트는 응답을 받은 시각에서 전송 시각을 빼서 RTT를 구한다.

```text
roundTripMs = clientReceivedAtMs - clientSentAtMs
```

현재 구현은 서버 처리 시간이 매우 짧다고 보고, 클라이언트 왕복 시간의 중간 지점과 서버 응답 시각을 비교한다.

```text
clientMidpointMs
= (clientSentAtMs + clientReceivedAtMs) / 2

clockOffsetMs
= serverTimeMs - clientMidpointMs
```

세 표본 중 RTT가 가장 짧은 표본의 Clock Offset을 선택한다. 큐 대기와 일시적인 지연이 비교적 적게 포함된 표본일 가능성이 높기 때문이다.

### 4. 서버 시작 시각을 클라이언트 시각으로 변환

서버는 자신의 `Date.now()`를 기준으로 미래의 경기 시작 시각을 만든다.

```text
startAtServerMs = Date.now() + 시작 준비 시간
```

클라이언트는 Clock Offset을 빼서 자신의 시각으로 변환한다.

```text
startAtClientMs
= startAtServerMs - clockOffsetMs
```

게임 시작까지 남은 시간은 다음과 같이 계산한다.

```text
delayMs
= startAtClientMs - client Date.now()
```

AudioContext는 이 지연을 이용해 음원 시작을 예약한다.

---

## 9. 현재 구현의 범위와 결정

현재 시간 동기화는 멀티플레이 학습 프로젝트에 필요한 최소 구현이다.

- 별도의 RTT/Jitter 진단 UI는 만들지 않는다.
- 서버 수신 시각과 전송 시각을 분리하는 고급 측정 기능은 추가하지 않는다.
- 현재 세 표본과 최소 RTT 선택 방식을 유지한다.
- 네트워크 환경에 따라 완벽한 동시 시작은 불가능하며 Clock Offset은 추정값임을 인정한다.

또한 시간 동기화는 경기 결과 판정 아키텍처를 변경하지 않는다.

```text
각 클라이언트
→ 노트 판정과 점수를 로컬에서 계산
→ 경기 종료 시 최종 결과를 한 번에 서버로 전송
→ 서버는 전달된 결과를 신뢰하여 저장
→ 참가자 결과를 모아 순위를 결정
```

서버가 노트별 입력을 받아 리듬 판정을 다시 실행하는 구조로 변경하지 않는다. 서버의 최종 결정권은 방 참가자, 준비 상태, 시작 시각, 경기 상태, 결과 수집 여부와 최종 순위 같은 공유 상태에 적용한다.

---

## 최종 정리

- 편도 Latency는 서로 다른 컴퓨터의 시각을 비교해야 하므로 RTT보다 측정하기 어렵다.
- RTT에는 네트워크 이동뿐 아니라 서버 처리와 양쪽 이벤트 루프 대기도 포함될 수 있다.
- Jitter가 크면 실시간 상태가 멈췄다가 몰아서 갱신되는 것처럼 보일 수 있다.
- WebSocket은 TCP 위에서 동작하므로 패킷 유실은 주로 애플리케이션의 누락보다 지연과 일시 정지로 관찰된다.
- `performance.now()`는 같은 환경의 경과 시간 측정에 적합하고, 서로 다른 컴퓨터끼리 직접 비교할 수 없다.
- 브라우저의 time origin은 현재 문서의 navigation 시작, Node.js의 time origin은 현재 프로세스 시작을 기준으로 한다.
- `Date.now()` 기반 시각을 교환해 Clock Offset을 추정할 수 있지만 네트워크 경로의 비대칭 때문에 정확한 값은 아니다.
- 읏짜는 최소 RTT 표본으로 Clock Offset을 추정해 서버 시작 시각을 각 브라우저의 시각으로 변환한다.

