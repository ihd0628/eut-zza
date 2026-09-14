# Cookie, Authorization, Cache-Control, ETag

## 1. 학습 목적

HTTP Header 네 개가 해결하는 문제는 서로 다르다.

```text
상태와 인증 정보
├─ Cookie
└─ Authorization

HTTP Response 재사용
├─ Cache-Control
└─ ETag
```

Cookie와 Authorization을 같은 것으로 보거나 Cache-Control을 실제
cache 저장소라고 생각하지 않는 것이 핵심이다.

## 2. Cookie

HTTP는 기본적으로 독립적인 Request와 Response로 작동한다. 앞선
요청을 자동으로 기억하지 않는 server에 client 상태를 다시 전달할 수
있게 Cookie를 사용할 수 있다.

### Server에서 Browser로 Cookie 설정

```http
HTTP/1.1 200 OK
Set-Cookie: sessionId=abc123; Path=/; HttpOnly; Secure; SameSite=Lax
```

`Set-Cookie`는 Response Header다. Browser는 허용된 Cookie를 자신의
Cookie store에 저장한다.

### Browser에서 Server로 Cookie 전송

이후 domain·path·scheme·SameSite 등의 조건이 맞는 Request에 Browser가
Cookie Header를 자동으로 붙일 수 있다.

```http
GET /profile HTTP/1.1
Cookie: sessionId=abc123
```

방향을 구분한다.

```text
Server → Browser
→ Set-Cookie

Browser → Server
→ Cookie
```

### Cookie와 로그인은 같은 개념이 아니다

Cookie는 name·value와 속성을 가진 client 상태 전달 메커니즘이다.
Cookie 값에 session ID를 담고 server가 그 ID로 session을 찾으면 로그인
상태에 활용할 수 있다.

```text
Cookie
→ session ID 전달

Server session store
→ session ID에 해당하는 user 조회
```

Cookie에 무엇을 담았는지에 따라 용도가 달라지므로 Cookie 자체가
사용자 인증을 자동으로 보장하지는 않는다.

### 주요 Cookie 속성

```text
HttpOnly
→ document.cookie 같은 JavaScript API에서 읽지 못하게 제한
→ Browser는 요청 조건이 맞으면 HTTP Request에 전송 가능

Secure
→ HTTPS 같은 secure channel에서만 전송

Path
→ Cookie를 전송할 URL path 범위

Max-Age / Expires
→ Cookie 유효 기간

SameSite
→ cross-site 상황의 Cookie 전송을 제어
```

## 3. Authorization

`Authorization`은 client가 origin server에 credential을 전달하는 Request
Header다.

```http
GET /profile HTTP/1.1
Authorization: Bearer eyJ...
```

Bearer Token을 사용하는 frontend는 일반적으로 application code에서
Header를 명시적으로 설정한다.

```ts
fetch("/profile", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

```text
Cookie
→ 조건이 맞으면 Browser가 자동으로 전송할 수 있음

Authorization Bearer Header
→ application code가 Token을 명시적으로 붙이는 구성이 일반적
```

Bearer Token은 해당 값을 가진 사람이 사용할 수 있으므로 HTTPS로
보호해야 한다.

### Authentication과 Authorization

```text
Authentication
→ 이 사용자가 누구인지 확인

Authorization
→ 확인된 사용자가 특정 작업을 할 권한이 있는지 확인
```

일반적인 상태 구분은 다음과 같다.

```text
401 Unauthorized
→ 인증 credential이 없거나 유효하지 않음

403 Forbidden
→ 사용자를 확인했지만 해당 작업을 할 권한이 없음
```

실제 session·Cookie·JWT·Authorization 설계는 Week 5의 Authentication에서
구현한다.

## 4. HTTP cache는 어디에 있는가

HTTP cache는 하나의 고정된 저장소 이름이 아니다. HTTP Response를
저장하고 재사용하는 여러 계층이 있을 수 있다.

```text
Browser
│
├─ Browser private HTTP cache
│  ├─ memory cache
│  └─ disk cache
│
▼
CDN / Reverse Proxy
│
└─ shared HTTP cache
│
▼
Node.js / Fastify
│
└─ application cache
│     ├─ process memory
│     └─ Redis
▼
Database
```

### Browser private HTTP cache

특정 사용자의 Browser가 Response Header·Body·ETag·저장 시간 등을
메모리나 디스크에 저장할 수 있다.

```text
fresh cache hit
→ Browser가 network Request 자체를 생략 가능
→ Fastify는 요청을 받지 않음
```

Chrome Network 패널에서 구현에 따라 `(from memory cache)` 또는
`(from disk cache)` 같은 표시를 볼 수 있다.

### CDN·Reverse Proxy shared cache

Cloudflare 같은 CDN이 여러 사용자에게 보낼 HTTP Response를 edge에
저장할 수 있다.

```text
Browser cache miss
↓
Browser가 network Request 전송
↓
CDN shared cache hit
↓
CDN이 Response 반환
↓
origin Fastify에는 요청이 가지 않을 수 있음
```

HTTPS 경로의 임의의 중간 network 장비가 암호화된 HTTP Response를
자유롭게 읽고 cache할 수 있는 것은 아니다. Cloudflare 같이 TLS connection을
종료하는 정식 Reverse Proxy·CDN은 복호화된 HTTP Response를 다룰 수
있다.

### Application cache

Node.js process memory나 Redis에 application data를 저장할 수 있다.

```text
Fastify가 GET /songs Request를 받음
↓
Redis cache hit
↓
PostgreSQL 조회 생략
↓
Fastify가 Response 생성
```

이 경우 Fastify Request 자체는 이미 도착했다. Browser·CDN HTTP cache는
Request가 Fastify에 도착하는 것을 생략할 수 있지만 application cache는
Fastify 내부의 계산과 DB 조회를 줄인다.

## 5. Cache-Control

`Cache-Control`은 cache 저장소가 아니라 Browser·CDN 등의 HTTP cache가
Response를 어떻게 저장·재사용할지 지시하는 HTTP Header다.

```http
Cache-Control: max-age=60
```

이 Response를 60초 동안 fresh한 것으로 다룰 수 있음을 나탄낸다.

### 주요 directive

```text
max-age=60
→ 60초 동안 fresh
→ 조건이 맞으면 server 재검증 없이 재사용

no-store
→ Response를 저장하지 말 것

no-cache
→ 저장은 가능
→ 재사용하기 전에 server에 재검증할 것

private
→ Browser 같은 private cache에만 저장 가능

public
→ 조건이 맞으면 shared cache에도 저장 가능
```

가장 흔한 오해는 `no-cache`를 저장 금지로 이해하는 것이다.

```text
no-cache
≠ 저장 금지

no-cache
= 재사용 전 재검증

no-store
= 저장하지 않음
```

## 6. ETag과 조건부 Request

ETag는 server가 특정 resource representation에 붙이는 version validator다.

### 첫 Response

```http
HTTP/1.1 200 OK
Cache-Control: no-cache
ETag: "songs-v1"
Content-Type: application/json

{"songs":[...]}
```

Browser cache는 Response Body와 ETag를 함께 저장할 수 있다.

```text
URL: /songs
Body: {"songs":[...]}
ETag: "songs-v1"
```

### 재검증 Request

`Cache-Control: no-cache`라면 저장한 Response를 그대로 쓰기 전에 server에
재검증한다.

```http
GET /songs HTTP/1.1
If-None-Match: "songs-v1"
```

### 변경되지 않은 경우

server의 현재 ETag와 `If-None-Match`가 일치하면 Body를 다시 보낼 필요가
없다.

```http
HTTP/1.1 304 Not Modified
ETag: "songs-v1"
```

```text
server의 304 Response
+
Browser cache에 있던 Body
↓
Browser가 기존 representation 재사용
```

### 변경된 경우

```http
HTTP/1.1 200 OK
ETag: "songs-v2"
Content-Type: application/json

{"songs":[새로운 데이터]}
```

server가 새 Body와 ETag를 반환하고 Browser cache가 저장 내용을
갱신할 수 있다.

### Cache-Control과 ETag의 차이

```text
Cache-Control
→ 언제 저장한 Response를 사용하고
  언제 재검증할지 결정하는 정책

ETag
→ 재검증할 때 현재 representation이
  저장한 version과 같은지 비교하는 validator
```

## 7. cache 계층의 전체 순서

가까운 cache에서 유효한 Response를 찾으면 뒤의 계층에 접근하지 않을
수 있다.

```text
1. Browser private cache
   ↓ miss 또는 revalidation 필요

2. CDN / Reverse Proxy shared cache
   ↓ miss 또는 revalidation 필요

3. Fastify
   ↓

4. process memory / Redis application cache
   ↓ miss

5. PostgreSQL
```

각 cache는 서로 다른 data와 유효 정책을 가질 수 있다.

## 8. curl 실험의 주의점

일반적인 독립된 curl 실행은 Browser HTTP cache처럼 직전 Response Body와
ETag를 자동으로 재사용하지 않는다.

```bash
curl -i \
  -H 'If-None-Match: "songs-v1"' \
  http://127.0.0.1:3001/songs
```

이 명령은 client cache의 revalidation Request를 수동으로 흉내 낸다.
Fastify가 `304 Not Modified`를 반환해도 curl에 기존 Body가 저장돼 있는
것은 아니므로 Body는 출력되지 않는다.

실제 Browser cache 동작을 확인하려면 Chrome Network 패널에서 cache를
비활성화하는 option을 끄고 Request과 Fastify log를 함께 관찰해야 한다.

## 9. 네 Header 비교

| Header | 방향 | 핵심 역할 |
| --- | --- | --- |
| `Set-Cookie` | Response | Browser에 Cookie 저장 요청 |
| `Cookie` | Request | 저장된 Cookie를 server에 전달 |
| `Authorization` | Request | server에 credential 전달 |
| `Cache-Control` | Request/Response | HTTP cache 저장·재사용 정책 |
| `ETag` | Response | representation version validator |
| `If-None-Match` | Request | client가 보유한 ETag로 재검증 |

## 10. 바로잡은 오해

```text
Cookie = 로그인
→ 아님. Cookie에 session ID 등을 담아 로그인에 활용할 수 있음.

Authorization = 권한 판단 결과
→ 아님. client credential을 전달하는 HTTP Header임.

Cache-Control = cache 저장소
→ 아님. cache가 따를 정책을 전달하는 Header임.

no-cache = 저장 금지
→ 아님. 저장할 수 있지만 재사용 전 재검증해야 함.

ETag = cache data
→ 아님. Response representation의 version을 검증하는 식별자임.

304 Response에 기존 Body가 들어 있음
→ 아님. client cache의 기존 Body를 재사용하라는 응답임.
```

## 11. 현재 프로젝트의 범위

이번 Week 3에서는 Cookie·Authorization·Cache-Control·ETag의 HTTP 역할과
cache 계층을 학습했다. 현재 Fastify `/songs`에 ETag 조건부 Request를
구현한 것은 아니다.

이후 필요할 때 다음 실험을 보강한다.

```text
GET /songs
→ 200 + ETag + Body

GET /songs + If-None-Match
→ ETag 일치 시 304 + Body 없음
```

실제 로그인 상태와 Cookie·Session·JWT 선택은 Week 5에서 다룬다.

## 12. 핵심 결론

```text
Cookie는 Browser가 저장하고 조건이 맞는 HTTP Request에 자동으로 보낼 수 있다.

Authorization은 client credential을 origin server에 전달한다.

HTTP cache는 Browser와 CDN 등 여러 계층에 있을 수 있다.

Application cache는 Fastify 내부 처리를 줄이지만 HTTP Request 도착 자체를 없애지는 못한다.

Cache-Control은 저장·재사용 정책이고 ETag는 representation validator다.

304는 새 Body 대신 client가 저장한 Body를 재사용하게 한다.
```

## 참고 자료

- [RFC 6265: HTTP State Management Mechanism](https://www.rfc-editor.org/rfc/rfc6265)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111)
