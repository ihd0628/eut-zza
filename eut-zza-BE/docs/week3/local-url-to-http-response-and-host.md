# 로컬 URL에서 HTTP Response까지와 `Host` Header

> 실험 URL: `http://127.0.0.1:3001/health`
>
> 관련 코드: `src/fastify-server.ts`

## 1. 이번 실험에서 확인한 범위

다음 두 명령으로 로컬 Fastify 서버의 listening 상태와 HTTP 통신을
확인했다.

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
curl -v http://127.0.0.1:3001/health
```

현재 URL은 인터넷의 일반적인 HTTPS URL보다 단순하다.

```text
http://127.0.0.1:3001/health
```

- hostname 대신 IP 주소 `127.0.0.1`을 직접 사용한다.
- scheme이 `http`이므로 TLS를 사용하지 않는다.
- loopback 주소이므로 요청이 자기 컴퓨터 밖으로 나가지 않는다.
- Reverse Proxy 없이 Fastify 서버의 port로 직접 연결한다.

따라서 이번 실험은 다음 범위에 집중한다.

```text
URL 해석
→ TCP loopback 연결
→ HTTP/1.1 Request
→ Node.js와 Fastify 처리
→ HTTP/1.1 Response
```

## 2. URL 분해

```text
http://127.0.0.1:3001/health
│      │         │     └─ path
│      │         └─────── port
│      └───────────────── host
└──────────────────────── scheme
```

각 값의 의미는 다음과 같다.

| 구성 요소 | 값 | 의미 |
| --- | --- | --- |
| scheme | `http` | HTTP를 사용하며 이 요청에서는 TLS를 사용하지 않음 |
| host | `127.0.0.1` | 자기 컴퓨터를 가리키는 IPv4 loopback 주소 |
| port | `3001` | Fastify 서버가 기다리는 port |
| path | `/health` | 서버에서 요청할 resource 경로 |

## 3. `curl`이란 무엇인가

`curl`은 URL을 사용해 HTTP를 비롯한 여러 protocol 요청을 보낼 수 있는
command-line client다.

```text
브라우저
→ HTTP 요청
→ 응답 처리
→ HTML/CSS rendering
→ JavaScript 실행
→ Same-Origin Policy와 CORS 시행

curl
→ HTTP 요청
→ 응답을 terminal에 출력
→ 화면 rendering 없음
→ 브라우저 CORS 정책 시행 안 함
```

`curl -i`는 응답 Header를 함께 보여주고, `curl -v`는 연결 과정과 Request
Header까지 자세히 보여준다.

verbose 출력의 기호는 다음 뜻이다.

```text
* curl이 설명하는 연결 상태
> client가 server에 보낸 HTTP Request
< server가 client에 보낸 HTTP Response
```

## 4. `lsof`의 `LISTEN`

확인한 결과의 핵심 부분은 다음과 같다.

```text
node ... TCP 127.0.0.1:3001 (LISTEN)
```

이는 Node.js process가 운영체제에 listening socket을 열고
`127.0.0.1:3001`로 들어올 연결을 기다린다는 뜻이다.

```text
LISTEN
→ 현재 HTTP handler를 실행하고 있다는 뜻이 아님
→ 새로운 TCP connection을 받을 준비가 됐다는 뜻
```

## 5. TCP 연결

`curl -v`에서 다음 출력을 확인했다.

```text
* Trying 127.0.0.1:3001...
* Connected to 127.0.0.1 (127.0.0.1) port 3001
```

`curl` process가 client가 되어 `127.0.0.1:3001`의 server에 TCP 연결을
시도했고, 운영체제가 연결을 완료했다는 뜻이다.

`127.0.0.1`은 loopback 주소이므로 데이터는 물리적인 network card나
외부 router를 거치지 않고 같은 컴퓨터의 network stack 안에서 전달된다.
그렇더라도 TCP connection과 socket이라는 개념은 그대로 사용한다.

## 6. HTTP Request

연결 후 `curl`이 다음 메시지를 보냈다.

```http
GET /health HTTP/1.1
Host: 127.0.0.1:3001
User-Agent: curl/...
Accept: */*
```

첫 줄은 Request Line이다.

```text
GET       → Method
/health   → request target인 path
HTTP/1.1  → HTTP message version
```

그 아래부터는 Request Header다.

## 7. `Host` Header의 정확한 역할

`Host`는 target URI의 host와 선택적인 port를 전달하는 HTTP Request
Header다.

```http
Host: 127.0.0.1:3001
```

현재 값은 다음 두 부분이다.

```text
host: 127.0.0.1
port: 3001
```

`Host`에는 scheme인 `http://`나 path인 `/health`가 들어가지 않는다.

### TCP가 IP와 port를 아는데도 필요한 이유

여러 hostname이 같은 IP와 port를 공유할 수 있다.

```text
game.example.com  ─┐
admin.example.com ─┼─→ 203.0.113.10:80
music.example.com ─┘
```

DNS 조회 후 TCP connection은 IP와 port를 사용한다.

```text
game.example.com
↓ DNS
203.0.113.10
↓ TCP connection
203.0.113.10:80
```

TCP 연결 정보만으로는 원래 `game.example.com`, `admin.example.com`,
`music.example.com` 중 무엇을 요청했는지 알 수 없다. TCP는 목적지 domain
이름을 전달하지 않고 목적지 IP와 port로 연결하기 때문이다.

그래서 HTTP Request에 원래 target host를 담는다.

```http
GET /health HTTP/1.1
Host: game.example.com
```

또는:

```http
GET /health HTTP/1.1
Host: admin.example.com
```

Web server나 Reverse Proxy는 `Host`를 보고 서로 다른 사이트나 backend로
요청을 전달할 수 있다.

```text
Host: game.example.com
→ game backend

Host: admin.example.com
→ admin backend
```

### Request Line만으로는 host를 알 수 없다

일반적인 HTTP/1.1 origin server 요청의 Request Line에는 path와 query만
들어간다.

```http
GET /health HTTP/1.1
```

따라서 서버가 target을 파악하는 데 다음 정보들이 함께 사용된다.

```http
GET /health HTTP/1.1
Host: 127.0.0.1:3001
```

```text
Host Header
→ 127.0.0.1:3001

Request target
→ /health
```

HTTP/1.1 client는 유효한 `Host` Header를 보내야 한다. HTTP/1.1 요청에
`Host`가 없거나, 둘 이상 있거나, 값이 올바르지 않으면 server는
`400 Bad Request`로 응답해야 한다.

HTTP/2와 HTTP/3에서는 같은 target authority 정보가 `:authority`
pseudo-header로 전달될 수 있다.

### `Host`는 요청을 보낸 client의 이름이 아니다

`Host`는 목적지 server를 나타낸다.

```text
Host
→ 어디로 가는 요청인가?

client IP
→ 누가 연결했는가?
```

또한 `curl` 같은 client가 임의의 `Host` 값을 작성할 수 있으므로 이것만으로
사용자를 인증할 수는 없다.

## 8. `Host`와 `Origin`

CORS 실험에서는 다음 두 Header가 함께 존재했다.

```http
Host: 127.0.0.1:3001
Origin: http://localhost:5173
```

| Header | 의미 |
| --- | --- |
| `Host` | 이 HTTP 요청의 목적지 host와 port |
| `Origin` | 요청을 시작한 browser JavaScript의 출처 |

```text
Frontend JavaScript가 실행된 곳
→ Origin: http://localhost:5173

그 JavaScript가 요청하는 API
→ Host: 127.0.0.1:3001
```

## 9. Node.js와 Fastify에서 처리

TCP socket에 HTTP Request bytes가 도착하면 다음 흐름으로 처리된다.

```text
macOS network stack
↓
Node.js가 사용하는 server socket
↓
Node.js HTTP parser가 Request Line과 Header 해석
↓
HTTP 요청 객체 생성
↓
Fastify router가 GET /health 탐색
↓
/health handler 호출
↓
handler가 JavaScript 객체 반환
↓
Fastify가 JSON HTTP Response 생성
```

현재 handler는 다음 객체를 반환한다.

```ts
return {
  status: "ok",
  service: "eut-zza-be",
};
```

## 10. HTTP Response

`curl`이 받은 응답은 다음과 같다.

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Content-Type: application/json; charset=utf-8
Content-Length: 38
Connection: keep-alive
Keep-Alive: timeout=72

{"status":"ok","service":"eut-zza-be"}
```

첫 줄은 Status Line이다.

```text
HTTP/1.1 → HTTP message version
200      → Status Code
OK       → 사람이 읽을 수 있는 reason phrase
```

빈 줄 전까지는 Response Header이고, 빈 줄 뒤가 Response Body다.

## 11. keep-alive

```http
Connection: keep-alive
Keep-Alive: timeout=72
```

HTTP Response가 끝난 뒤 TCP connection을 즉시 닫지 않고 일정 조건에서
다음 HTTP 요청에 재사용할 수 있다는 뜻이다.

```text
HTTP Response 하나가 끝남
≠
TCP connection이 반드시 끝남
```

`curl`의 다음 출력도 서버가 연결을 강제로 즉시 종료하지 않았다는 뜻이다.

```text
* Connection #0 to host 127.0.0.1 left intact
```

이번 command는 한 요청 뒤 process가 종료되므로 연결도 이후 정리된다.
하나의 `curl` process가 같은 server에 여러 요청을 한다면 조건에 따라
connection을 재사용할 수 있다.

## 12. 로컬 요청의 전체 흐름

```text
curl이 URL 해석
↓
127.0.0.1:3001로 TCP connection
↓
loopback을 통해 같은 컴퓨터의 Node.js server에 도착
↓
GET /health HTTP/1.1 Request 전송
↓
Node.js가 HTTP message parsing
↓
Fastify가 GET /health route 선택
↓
handler가 객체 반환
↓
Fastify가 JSON Response 생성
↓
TCP connection으로 curl에 전달
↓
curl이 Response Header와 Body 출력
```

## 13. 이 로컬 실험에서 생략된 것

```text
DNS
→ IP인 127.0.0.1을 직접 사용했으므로 생략

TLS Handshake
→ https가 아니라 http이므로 생략

Reverse Proxy
→ Fastify port 3001로 직접 요청했으므로 생략
```

## 14. 실제 인터넷 환경 흐름 미리 보기

일반적인 운영 환경에서는 다음 단계가 추가될 수 있다.

```text
https://game.example.com 입력
↓
URL parsing
↓
DNS로 hostname을 IP로 변환
↓
HTTP/1.1 또는 HTTP/2: TCP connection 후 TLS handshake
HTTP/3: TCP 대신 UDP 기반 QUIC connection과 통합된 TLS 1.3 handshake
↓
HTTP Request
↓
Reverse Proxy 또는 Load Balancer
↓
Node.js application server
↓
HTTP Response
```

이 부분은 HTTP/1.1, HTTP/2, HTTP/3 비교와 함께 Week 3의 다음 학습에서
[외부 HTTPS 요청 문서](./https-dns-tcp-tls-reverse-proxy.md)로 확장했다.

## 15. 핵심 결론

```text
curl은 화면 rendering 없이 HTTP 요청을 보내는 command-line client다.

127.0.0.1:3001은 같은 컴퓨터에서 Fastify가 기다리는 목적지다.

TCP는 연결과 byte 전달을 담당하고 HTTP는 그 위의 메시지 형식을 담당한다.

Host는 target URI의 host와 port를 HTTP message에 전달한다.

DNS 후 같은 IP를 공유하는 여러 hostname을 구분하려면 Host가 필요하다.

HTTP Response의 끝과 TCP connection의 끝은 같은 개념이 아니다.
```

## 참고 자료

- [RFC 9110 Section 7.2: Host and :authority](https://www.rfc-editor.org/rfc/rfc9110.html#name-host-and-authority)
- [RFC 9112 Section 3.2: Request Target](https://www.rfc-editor.org/rfc/rfc9112.html#name-request-target)
- [Node.js HTTP](https://nodejs.org/api/http.html)
