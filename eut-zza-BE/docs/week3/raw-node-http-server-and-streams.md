# raw Node.js HTTP 서버와 Stream

> 관련 코드: `src/server.ts`
>
> 실행 명령: `npm run dev:raw`
>
> 서버 주소: `http://127.0.0.1:3000`

## 1. 학습 목적

Fastify가 자동으로 처리하는 일을 이해하기 위해 먼저 Node.js 내장
`node:http` 모듈만 사용해 서버를 만들었다.

직접 처리한 일은 다음과 같다.

```text
요청 Method와 URL 확인
Request Body Stream 읽기
UTF-8 문자열 구성
JSON.parse()
입력 데이터 검증
라우트 선택
Status Code 결정
Response Header 작성
JSON.stringify()
Response Body 전송
오류 처리
```

## 2. `http.createServer()`와 `listen()`

서버의 시작 부분은 다음 구조다.

```ts
const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch(/* 오류 처리 */);
});

server.listen(3000, "127.0.0.1", () => {
  console.log("Eut-zza API server: http://127.0.0.1:3000");
});
```

`http.createServer()`는 HTTP 서버 객체를 생성한다. 이 시점에
`handleRequest()`가 바로 실행되는 것은 아니다.

`listen()`을 호출하면 운영체제에 `127.0.0.1:3000`을 열고 연결을
기다리도록 요청한다.

```text
createServer()
→ HTTP server 객체 생성

listen(3000, "127.0.0.1")
→ 운영체제에 listening socket 생성
→ 127.0.0.1:3000에서 연결 대기

HTTP 요청 도착
→ createServer에 전달한 callback 호출
→ handleRequest() 호출
```

## 3. `IncomingMessage`와 `ServerResponse`

### `IncomingMessage`

서버의 `request`는 `IncomingMessage`다.

```ts
request.method;
request.url;
request.headers;
```

다음 정보를 읽을 수 있다.

- HTTP Method
- 경로와 Query String
- Request Header
- Request Body

`IncomingMessage`는 요청 Body를 읽을 수 있는 `Readable Stream`이기도
하다. 다만 `IncomingMessage` 자체가 TCP socket인 것은 아니다.
하부 socket은 `request.socket`을 통해 별도로 참조할 수 있다.

```text
TCP socket
→ 연결에서 들어오는 바이트 운반

IncomingMessage
→ 그 연결에서 파싱된 HTTP 요청 하나를 표현
→ Header 정보 제공
→ Body를 Readable Stream으로 제공
```

HTTP/1.1 keep-alive에서는 하나의 socket이 여러 HTTP 요청에 재사용될 수
있으므로 socket과 HTTP 요청 객체를 같은 것으로 보면 안 된다.

### `ServerResponse`

서버의 `response`는 클라이언트에게 HTTP 응답을 작성하는 객체다.

```ts
response.statusCode = 200;
response.setHeader("Content-Type", "application/json; charset=utf-8");
response.end(body);
```

이를 통해 다음을 결정한다.

```text
Status Code
Response Header
Response Body
응답 메시지의 끝
```

## 4. 일반 HTTP 요청에서도 Stream을 사용하는 이유

네트워크 데이터는 JavaScript 객체 하나로 즉시 도착한다고 보장할 수 없다.
시간에 따라 일부 바이트가 먼저 도착하고 나머지가 나중에 도착할 수 있다.

```text
클라이언트가 보낸 Body
{"email":"test@example.com","password":"1234"}

Node.js가 애플리케이션에 전달할 수 있는 형태의 예
chunk 1: {"email":"test@
chunk 2: example.com","pass
chunk 3: word":"1234"}
```

위 분할은 예시일 뿐이다. 애플리케이션은 chunk의 개수나 경계를 예상하면
안 된다.

Stream을 사용하면 다음 장점이 있다.

- 데이터가 도착하는 대로 처리할 수 있다.
- 큰 Body를 반드시 한 번에 메모리에 올릴 필요가 없다.
- 파일, 압축, 암호화, HTTP처럼 서로 다른 데이터 원천을 비슷한 방식으로
  다룰 수 있다.

GET 요청처럼 Body가 비어 있는 요청도 같은 HTTP 요청 인터페이스를
사용한다. 이 경우 읽을 Body가 없을 뿐이다.

## 5. chunk와 TCP packet은 같은 것이 아니다

다음 둘을 구분해야 한다.

```text
TCP packet/segment
→ 네트워크와 전송 계층에서 데이터를 운반하는 단위

Node.js Stream chunk
→ Node.js가 JavaScript 코드에 한 번 전달하는 데이터 단위
```

운영체제 버퍼, TCP 처리, Node.js 내부 버퍼링의 영향을 받기 때문에 다음과
같은 일대일 대응은 보장되지 않는다.

```text
TCP packet 하나 = data 이벤트 하나  (보장되지 않음)
```

여러 packet의 데이터가 하나의 chunk로 합쳐질 수도 있고, 하나의 전송
데이터가 여러 chunk로 전달될 수도 있다. 따라서 Body가 완성될 때까지
chunk를 모아야 한다.

## 6. Request Body를 읽는 코드

현재 구현은 다음 구조다.

```ts
const readRequestBody = (request: IncomingMessage): Promise<string> => {
  return new Promise((resolve, reject) => {
    let body = "";
    let receivedBytes = 0;
    let isBodyTooLarge = false;

    request.setEncoding("utf8");

    request.on("data", (chunk: string) => {
      if (isBodyTooLarge) {
        return;
      }

      receivedBytes += Buffer.byteLength(chunk, "utf8");

      if (receivedBytes > MAX_REQUEST_BODY_BYTES) {
        isBodyTooLarge = true;
        body = "";
        reject(new RequestBodyTooLargeError());
        return;
      }

      body += chunk;
    });

    request.on("end", () => {
      if (!isBodyTooLarge) {
        resolve(body);
      }
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
};
```

### `setEncoding("utf8")`

인코딩을 지정하지 않으면 일반적인 binary Stream chunk는 `Buffer`로
전달된다. UTF-8을 지정했기 때문에 현재 `data` listener는 문자열 chunk를
받는다.

### `data`

읽을 데이터가 전달될 때마다 callback이 호출된다.

```ts
request.on("data", (chunk) => {
  body += chunk;
});
```

callback이 여러 번 실행될 수 있으므로 모든 chunk를 합친다.

### `end`

더 이상 읽을 데이터가 없으면 발생한다.

```ts
request.on("end", () => {
  resolve(body);
});
```

이 시점에 전체 Body 문자열이 준비됐으므로 Promise를 이행한다.

### `error`

요청 Stream을 읽는 중 오류가 발생하면 Promise를 거부한다.

```ts
request.on("error", reject);
```

## 7. `await readRequestBody()`의 정확한 흐름

```ts
const body = await readRequestBody(request);
```

이 코드는 메인 스레드나 Node.js 전체를 멈추지 않는다.

```text
readRequestBody() 호출
↓
data/end/error listener 등록
↓
아직 Body 수신 중이므로 Promise pending
↓
현재 handleRequest() 실행 중단
↓
Node.js는 다른 I/O 처리 가능
↓
data 이벤트마다 chunk 수집
↓
end 이벤트에서 resolve(body)
↓
await 이후 continuation이 Microtask로 준비
↓
handleRequest()의 나머지 코드 재개
```

Body chunk가 도착할 때마다 Promise Microtask가 하나씩 생성되는 것은
아니다. `data`는 Stream의 EventEmitter callback으로 처리된다. Promise는
마지막 `resolve()` 또는 오류의 `reject()`에서 한 번 settle되고, 그 결과로
`await` 이후 실행이 Microtask를 통해 재개된다.

`body`, `receivedBytes`, `isBodyTooLarge`는 Promise executor가 끝난 뒤에도
등록된 listener들이 참조한다. 따라서 이 변수들은 closure를 통해 유지된다.

## 8. JavaScript 객체를 바로 HTTP Body로 보낼 수 없는 이유

HTTP 연결을 통해 전송되는 것은 JavaScript 객체 자체가 아니라 바이트다.
따라서 객체를 JSON 문자열로 직렬화한다.

```ts
const payload = {
  status: "ok",
};

const body = JSON.stringify(payload);
```

```text
JavaScript 객체
→ JSON.stringify()
→ JSON 문자열
→ UTF-8 인코딩
→ 바이트
→ 네트워크 전송
```

클라이언트는 받은 바이트를 문자열로 해석하고 JSON parser를 사용해 다시
데이터 구조로 만든다.

## 9. UTF-8과 `Content-Length`

Unicode는 문자마다 번호를 부여하고, UTF-8은 그 번호를 실제 바이트로
표현하는 인코딩 방식이다.

```text
문자    Unicode       UTF-8 bytes       크기
A       U+0041        41                1 byte
가      U+AC00        EA B0 80          3 bytes
😀      U+1F600       F0 9F 98 80       4 bytes
```

표의 `41`은 십진수 41이 아니라 16진수 한 바이트 `0x41`이다.

```text
0x41
→ binary 01000001
→ 8 bit
→ 1 byte
```

문자마다 UTF-8에서 사용하는 바이트 수가 다르므로 JavaScript 문자열의
`length`를 HTTP `Content-Length`로 사용하면 안 된다.

```ts
Buffer.byteLength(body, "utf8");
```

`Content-Length`는 문자 개수가 아니라 실제 전송할 Body의 바이트 수다.
그래야 수신자가 Body의 끝을 정확히 판단할 수 있다.

## 10. `sendJson()`과 `response.end()`

```ts
const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void => {
  const body = JSON.stringify(payload);

  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
};
```

`response.end(body)`는 다음 두 일을 한다.

1. 전달한 `body`를 응답 Body의 마지막 데이터로 쓴다.
2. Header와 Body 작성이 모두 끝났으므로 이 HTTP 응답 메시지가
   완료됐다고 알린다.

`response.end()`가 곧 TCP 연결을 무조건 닫는다는 뜻은 아니다.
HTTP/1.1 keep-alive 조건이 맞으면 같은 연결을 다음 HTTP 요청에 재사용할 수
있다.

```text
HTTP 응답 메시지 종료
≠
TCP 연결 무조건 종료
```

## 11. `Content-Type`과 오류 구분

JSON API는 다음 Header를 사용한다.

```http
Content-Type: application/json; charset=utf-8
```

이는 Body의 바이트를 다음 방식으로 해석하라는 뜻이다.

```text
media type: application/json
charset:    utf-8
```

현재 raw 서버는 요청의 media type이 JSON인지 먼저 확인한다.

```ts
const contentType = request.headers["content-type"];
const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
```

오류는 서로 다른 단계에서 발생한다.

```text
지원하지 않는 Content-Type
→ 415 Unsupported Media Type

application/json이지만 JSON 문법 오류
→ 400 Bad Request: Invalid JSON

JSON 문법은 맞지만 email/password 구조가 잘못됨
→ 400 Bad Request: Invalid signup/login body

로그인 구조는 맞지만 자격 증명이 일치하지 않음
→ 401 Unauthorized
```

지원하지 않는 Body를 사용하지 않을 때 `request.resume()`을 호출한 이유는
남아 있는 요청 데이터를 읽어서 버리기 위해서다. 요청 Stream을 소비하면
keep-alive 연결을 재사용하기 쉬워진다.

## 12. TypeScript 타입과 런타임 데이터

외부에서 들어온 JSON은 TypeScript 타입을 따를 의무가 없다.
`JSON.parse()` 결과를 바로 신뢰하면 안 되므로 먼저 `unknown`으로 받았다.

```ts
let payload: unknown;
payload = JSON.parse(body);
```

그 후 type guard로 런타임 구조를 확인했다.

```ts
const isCredentialsRequestBody = (
  value: unknown,
): value is CredentialsRequestBody => {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string" &&
    "password" in value &&
    typeof value.password === "string"
  );
};
```

```text
TypeScript type
→ 개발 및 compile 과정의 검사

type guard
→ 서버가 실행되는 동안 실제 외부 데이터 검사
```

## 13. Body 크기 제한

Body를 제한 없이 문자열에 계속 추가하면 공격자나 잘못된 클라이언트가 매우
큰 데이터를 보내 서버 메모리와 CPU를 소모시킬 수 있다.

현재 제한은 16 KiB다.

```ts
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
```

`data` 이벤트마다 UTF-8 바이트 수를 누적하고 제한을 넘으면 Promise를
거부한다.

```text
수신 Body가 16 KiB 초과
→ RequestBodyTooLargeError
→ handleRequest() Promise reject
→ 중앙 catch에서 처리
→ 413 Payload Too Large
```

실험에서는 비밀번호를 20,000자로 만들어 다음 응답을 확인했다.

```http
HTTP/1.1 413 Payload Too Large

{"error":"Request body is too large"}
```

## 14. Promise rejection의 중앙 처리

`handleRequest()`는 `async` 함수이므로 처리 중 발생한 예외는 반환한
Promise의 rejection이 된다.

```ts
const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    // 오류를 HTTP 응답으로 변환한다.
  });
});
```

여기서 `void`는 Promise를 의도적으로 직접 `await`하지 않는다는 표시다.
그러나 뒤에 `.catch()`가 연결되어 있으므로 rejection을 무시하는 것은
아니다.

오류 처리 순서는 다음과 같다.

```text
이미 response.end()가 호출됨
→ 추가 응답을 보내지 않음

Body가 너무 큼
→ 413 JSON 응답

그 밖의 예상하지 못한 오류 + Header를 아직 안 보냄
→ 500 JSON 응답

Header 일부가 이미 전송됨
→ 새로운 정상 응답을 만들 수 없으므로 연결 destroy
```

이미 Header를 보낸 뒤 다시 Status Code와 Header를 바꿔서 완전히 새로운
HTTP 응답을 보낼 수 없기 때문에 `response.headersSent`를 확인한다.

## 15. 구현한 라우트

```text
GET  /health
GET  /songs
GET  /songs/:id
POST /auth/signup
POST /auth/login
```

라우터 라이브러리를 사용하지 않았으므로 Method, pathname, path segment를
직접 비교했다.

## 16. 핵심 결론

```text
IncomingMessage는 HTTP 요청 하나이자 Body를 읽는 Readable Stream이다.

Stream chunk는 TCP packet과 같은 단위가 아니다.

data callback은 chunk를 수집하고 end는 Body 수신 완료를 나타낸다.

await는 Node.js 전체를 막지 않고 현재 async 함수만 중단한다.

HTTP Body로 전송되는 것은 JavaScript 객체가 아니라 인코딩된 바이트다.

Content-Length는 문자 수가 아니라 바이트 수다.

response.end()는 HTTP 응답을 완료하지만 TCP 연결까지 반드시 닫지는 않는다.
```

## 참고 자료

- [Node.js HTTP](https://nodejs.org/api/http.html)
- [Node.js Stream](https://nodejs.org/api/stream.html)
- [Node.js Buffer.byteLength](https://nodejs.org/api/buffer.html#static-method-bufferbytelengthstring-encoding)
