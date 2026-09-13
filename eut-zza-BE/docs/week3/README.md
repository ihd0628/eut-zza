# Week 3 — HTTP, Network, Node.js

> 학습 기간: 2026년 9월 8일 ~ 9월 14일
>
> 프로젝트: eut-zza Backend

## 학습 순서

Week 3에서는 Web framework부터 시작하지 않고 HTTP의 저수준 동작부터
확인한 뒤 Fastify로 이동했다.

```text
Node.js node:http로 raw server 구현
↓
IncomingMessage와 ServerResponse 확인
↓
Request Body Stream과 UTF-8/JSON 처리
↓
오류 처리와 Body 크기 제한
↓
같은 REST API를 Fastify로 구현
↓
Browser에서 API 호출
↓
Same-Origin Policy와 CORS 실패 관찰
↓
CORS 허용 및 Preflight 관찰
↓
로컬 URL에서 HTTP Response까지 추적
```

## 문서 목록

### 1. [raw Node.js HTTP 서버와 Stream](./raw-node-http-server-and-streams.md)

다음 내용을 정리한다.

- `http.createServer()`와 `listen()`
- `IncomingMessage`와 `ServerResponse`
- 일반 요청에서도 Stream을 사용하는 이유
- Stream chunk와 TCP packet의 차이
- `data`, `end`, `error` 이벤트
- `await readRequestBody()`와 Microtask
- JSON 직렬화, UTF-8, `Content-Length`
- `response.end()`와 keep-alive
- `400`, `401`, `404`, `413`, `415`, `500`
- Promise rejection의 중앙 처리

### 2. [raw HTTP 서버에서 Fastify REST API로 이동하기](./fastify-rest-api.md)

다음 내용을 정리한다.

- `Fastify()`와 `server.listen()`
- route 등록과 handler 실행 시점
- Path parameter
- Content-Type parser
- `bodyLimit`
- TypeScript type과 JSON Schema의 차이
- Fastify request lifecycle의 핵심 흐름
- raw 서버에서 직접 한 일과 Fastify가 대신한 일

### 3. [Same-Origin Policy, CORS, Preflight](./cors-same-origin-and-preflight.md)

다음 내용을 정리한다.

- Origin을 구성하는 scheme, host, port
- 서버는 `200`인데 browser fetch는 실패한 이유
- `Access-Control-Allow-Origin`
- CORS가 방화벽이나 인증이 아닌 이유
- 브라우저가 자동으로 보내는 `OPTIONS` Preflight
- Preflight Request와 Response Header
- `204 No Content`
- Preflight cache
- `Host`, `Origin`, `Access-Control-Allow-Origin`의 차이

### 4. [로컬 URL에서 HTTP Response까지와 Host Header](./local-url-to-http-response-and-host.md)

다음 내용을 정리한다.

- `lsof`로 확인한 listening socket
- `curl -v`로 확인한 TCP와 HTTP 메시지
- `127.0.0.1` loopback
- Request Line과 Status Line
- TCP의 IP/port와 HTTP `Host`가 모두 필요한 이유
- name-based virtual hosting
- HTTP Response와 TCP connection 종료의 차이
- 로컬 요청에서 DNS, TLS, Reverse Proxy가 생략된 이유

## 관련 코드

- [`src/server.ts`](../../src/server.ts): raw Node.js HTTP server
- [`src/fastify-server.ts`](../../src/fastify-server.ts): Fastify REST API와 CORS

## 현재 구현한 API

```text
GET  /health
GET  /songs
GET  /songs/:id
POST /auth/signup
POST /auth/login
```

회원가입과 로그인은 HTTP Body, validation, Status Code를 학습하기 위한 mock
구현이다. 아직 데이터베이스에 사용자를 저장하지 않고 비밀번호 hashing,
Cookie, Session, JWT도 사용하지 않는다. 실제 Authentication은 Week 5에서
구현한다.

## 아직 남은 Week 3 학습

- 외부 HTTPS URL의 DNS, transport, TLS, Reverse Proxy 전체 흐름
- HTTP/1.1, HTTP/2, HTTP/3의 구조적 차이
- Cookie, Cache-Control, ETag, Authorization의 역할

완료 조건은 단순히 코드를 실행한 것이 아니라 각 흐름을 자신의 말로
설명할 수 있는 상태다.
