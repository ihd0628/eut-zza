# Week 6: HTTP keep-alive와 WebSocket 연결 실험

> Week 6의 첫 단계 학습 기록. 브라우저 콘솔에서 `/ws/echo`에 연결해
> handshake, 메시지 왕복, 정상 종료를 확인한 과정을 기준으로 정리했다.

## 1. 이번 실험에서 확인한 것

```text
브라우저가 WebSocket 연결 시작
  → HTTP/1.1 Upgrade 요청과 101 응답
  → open 이벤트
  → 브라우저가 "hello" 전송
  → 서버가 "hello"를 그대로 돌려줌
  → message 이벤트
  → 브라우저가 정상 종료 요청
  → close 이벤트 (code: 1000)
```

실험에 사용한 서버 코드는 [`src/app.ts`](../../src/app.ts)와
[`src/routes/websocket-lab-routes.ts`](../../src/routes/websocket-lab-routes.ts)에 있다.
`/ws/echo`는 연결 원리를 확인하기 위한 경로이며, 방·게임·DB 기능은 없다.

## 2. “연결 유지”는 물리적인 전용 선이 아니다

TCP 연결이 성립하면 양쪽 운영체제가 상대 주소와 포트, 연결 상태, 데이터의 순서 등을
관리한다. 데이터가 오가지 않는 동안에도 연결 상태를 유지할 수 있으며, 이때 전용
전선이 생기거나 패킷이 끊임없이 흐르는 것은 아니다. 전송할 데이터가 생기면 기존
연결을 사용한다. 다만 네트워크가 끊기거나 중간 장비의 유휴 시간 제한에 걸리면
연결이 더는 유효하지 않을 수 있다. [TCP 명세](https://www.rfc-editor.org/rfc/rfc9293.html)

HTTP keep-alive와 WebSocket은 모두 TCP 연결을 오래 사용할 수 있지만,
그 위에서 지키는 **응용 프로토콜의 규칙**이 다르다.

| 방식 | 열린 연결로 주고받는 것 |
| --- | --- |
| HTTP/1.1의 지속 연결(keep-alive) | 요청에 대한 응답을 받은 뒤, 같은 TCP 연결을 다음 HTTP 요청·응답에 재사용한다. |
| WebSocket | 연결 전환 후 클라이언트와 서버가 서로 독립적으로 WebSocket 메시지를 보낸다. 메시지마다 새 HTTP 요청을 만들지 않는다. |

따라서 HTTP keep-alive는 **HTTP가 TCP 연결을 재사용하는 방식**이지,
TCP 계층의 별도 기능을 뜻하지 않는다. 운영체제의 **TCP keepalive**는
유휴 연결의 생존 여부를 확인하는 별개 기능이다.
[HTTP/1.1 지속 연결](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.3),
[TCP keep-alive](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.4)

“HTTP에서는 서버가 데이터를 계속 보낼 수 없다”는 뜻은 아니다. SSE처럼
클라이언트의 HTTP 요청에 대한 **응답을 열어둔 채** 서버가 데이터를 흘려보낼 수
있다. 그러나 이 실험에서 비교하는 일반적인 요청·응답과 WebSocket의 독립적인
양방향 메시지 전송은 다른 방식이다.
[HTML 표준의 SSE 설명](https://html.spec.whatwg.org/dev/server-sent-events.html)

## 3. HTTP로 시작하지만, 성공한 뒤에는 WebSocket 메시지를 보낸다

이 실험의 HTTP/1.1 WebSocket handshake는 다음과 같다. 실제
`Sec-WebSocket-Key`와 `Sec-WebSocket-Accept` 값은 연결마다 달라진다.

```http
GET /ws/echo HTTP/1.1
Host: 127.0.0.1:3001
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
Origin: http://localhost:5173
```

```http
HTTP/1.1 101 Switching Protocols
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Accept: ...
```

`101 Switching Protocols`는 서버가 전환 요청을 수락했다는 **HTTP 응답 상태**다.
이후 이 TCP 연결에서는 일반 HTTP 요청·응답 대신 WebSocket 프레임을 주고받는다.
브라우저의 다른 `fetch()` 요청은 별도의 HTTP 통신으로 계속 사용할 수 있다.
서버의 `Sec-WebSocket-Accept`는 요청의 `Sec-WebSocket-Key`를 바탕으로 계산되며,
두 헤더의 값이 같은 것은 아니다. 이 값들은 handshake 확인에 쓰이지 TLS 암호화
키나 로그인 인증 정보가 아니다.
[WebSocket 프로토콜 명세](https://www.rfc-editor.org/rfc/rfc6455.html)

## 4. 실제 서버 코드는 무슨 일을 하는가

`@fastify/websocket`을 일반 라우트보다 먼저 등록해 Upgrade 요청을 처리한다.
실험용 경로의 핵심은 다음과 같다.
[Fastify WebSocket 공식 설명](https://github.com/fastify/fastify-websocket)

```ts
server.get("/ws/echo", { websocket: true }, (socket, request) => {
  request.log.info("WebSocket connected");

  socket.on("message", (message) => {
    socket.send(message.toString());
  });

  socket.on("close", () => {
    request.log.info("WebSocket closed");
  });
});
```

여기서 `socket`은 서버 쪽 WebSocket 객체다. `message` 이벤트가 오면 받은
값을 문자열로 바꿔 **같은 연결**로 돌려보낸다. 이때 Fastify의 JSON HTTP 응답을
새로 만드는 것은 아니다. `close`는 연결 종료를 관찰하기 위한 이벤트다.
리스너는 연결 핸들러 안에서 즉시 등록한다.

## 5. 브라우저에서 실행한 코드와 콘솔 결과

백엔드에서 `npm run dev:fastify`로 서버를 실행한 뒤, 브라우저 콘솔에서 다음
코드를 실행했다. `globalThis.echoWs`로 저장해두었기 때문에 다음 콘솔 입력에서도
같은 WebSocket 객체를 사용할 수 있다.

```js
globalThis.echoWs = new WebSocket("ws://127.0.0.1:3001/ws/echo");

echoWs.addEventListener("open", () => {
  console.log("open");
  echoWs.send("hello");
});
echoWs.addEventListener("message", (event) => console.log("received:", event.data));
echoWs.addEventListener("close", (event) => console.log("closed:", event.code));
```

확인 후 별도의 콘솔 입력으로 연결을 닫았다.

```js
echoWs.close(1000);
```

실제로 관찰한 출력:

```text
undefined
open
received: hello
undefined
closed: 1000
```

| 출력 | 의미 |
| --- | --- |
| 첫 `undefined` | 여러 줄을 한 번에 실행했을 때 마지막 `addEventListener()`의 반환값이 표시된 것. 서버 응답이나 오류가 아니다. |
| `open` | 연결에 성공해 `open` 이벤트가 발생했다. 이 콜백에서 `hello`를 보냈다. |
| `received: hello` | 서버가 받은 `hello`를 `socket.send()`로 돌려보내 브라우저의 `message` 이벤트가 실행됐다. HTTP 응답 본문이 아니다. |
| 두 번째 `undefined` | `echoWs.close(1000)`의 반환값이 표시된 것. |
| `closed: 1000` | 연결이 종료됐고, 정상 종료 코드 `1000`을 받았다. |

## 6. `new WebSocket()` 뒤에 `open` 리스너를 붙여도 안전한 이유

`new WebSocket(...)`은 연결을 시작하고 객체를 돌려준다. 연결이 성공했을 때
브라우저는 `readyState`를 `OPEN`으로 바꾸고 `open` 이벤트를 발생시키는 작업을
**Task로 예약**한다. 현재 실행 중인 JavaScript가 끝나기 전에 그 이벤트 콜백이
중간에 끼어들어 실행되지 않는다. 따라서 생성 직후 **동기적으로** 리스너를
등록하는 위 코드에는 연결 속도에 따른 경쟁 상태가 없다.
[WHATWG WebSocket 표준](https://websockets.spec.whatwg.org/#feedback-from-the-protocol)

```text
현재 JavaScript 실행:
  new WebSocket() → 리스너 등록 → 현재 실행 종료

이후 예약된 작업:
  OPEN 상태로 변경 → open 이벤트 → hello 전송
```

반대로 객체 생성과 리스너 등록 사이에 `await`나 타이머를 넣어 실행을 양보하면,
그동안 `open` 이벤트가 먼저 처리되어 리스너가 이를 놓칠 수 있다. 또한 연결이
열리기 전에 바로 `send()`를 호출해서는 안 된다. 리스너를 생성자 호출 **이전**에
붙이는 것도 아직 객체가 없으므로 불가능하다.

## 7. Chrome Network 탭에서 무엇을 보는가

1. 개발자 도구의 **Network → WS**에서 `/ws/echo` 연결을 선택한다.
2. **Headers → General → Status Code**에 표시된 `101 Switching Protocols`를 본다.
   `101`은 응답 헤더 이름이 아니라 handshake의 HTTP **상태 코드**다.
3. 요청과 응답 양쪽의 `Connection: Upgrade`, `Upgrade: websocket`을 확인하고,
   요청의 `Sec-WebSocket-Key`와 응답의 `Sec-WebSocket-Accept`를 각각 찾는다.
   둘은 같은 문자열이 아니다.
4. **Messages** 탭에서 브라우저가 보낸 `hello`와 서버가 돌려준 `hello`를 본다.
   이후 메시지를 더 보내도 그때마다 새로운 HTTP 요청이 생기지 않는다.

[Chrome DevTools의 WebSocket 메시지 확인 방법](https://developer.chrome.com/docs/devtools/network/reference/#analyze-the-messages-of-a-websocket-connection)

## 8. 여기까지의 결론과 다음 범위

- 연결 유지란 물리적인 전용 선이 아니라 양쪽이 통신 상태를 유지하는 것이다.
- HTTP keep-alive와 WebSocket의 차이는 단순히 연결을 닫느냐가 아니라
  **열린 연결에서 따르는 통신 규칙**이다.
- 이 실험에서 HTTP는 최초 WebSocket 전환에 쓰였고, `hello` 왕복은 WebSocket
  메시지로 이루어졌다.
- 이 echo 경로에는 인증, 방 상태, Origin 검사 등 제품용 멀티플레이 규칙이 없다.
  실제 방 기능에 그대로 사용하지 않는다.

로드맵의 다음 단계에서는 방장 이탈, 동점, 미완주, 결과 제출 시간 초과 등의
방·경기 규칙을 정한 뒤 실제 멀티플레이 연결에 적용한다.
