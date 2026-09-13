# Same-Origin Policy, CORS, Preflight

> 실험 페이지: `http://localhost:5173`
>
> API server: `http://127.0.0.1:3001`
>
> 관련 코드: `src/fastify-server.ts`

## 1. Origin이란 무엇인가

Origin은 다음 세 값의 조합이다.

```text
scheme +://host:port
```

둘 중 하나라도 다르면 같은 Origin이 아니다.

```text
Frontend: http://localhost:5173
API:      http://127.0.0.1:3001
```

현재 실험에서는 host와 port가 모두 다르므로 cross-origin 요청이다.

같은 `localhost`를 사용하더라도 port가 다르면 역시 cross-origin이다.

```text
http://localhost:5173
http://localhost:3001
                 └─ port가 다름
```

## 2. Same-Origin Policy

브라우저는 한 Origin에서 실행된 JavaScript가 다른 Origin의 데이터를
자유롭게 읽지 못하도록 제한한다. 이를 Same-Origin Policy라고 한다.

예를 들어 공격자가 만든 페이지의 JavaScript가 사용자의 브라우저를 통해
은행, 이메일, 사내 시스템의 응답을 마음대로 읽을 수 있다면 개인정보가
노출될 수 있다.

따라서 기본 방향은 다음과 같다.

```text
같은 Origin의 응답
→ JavaScript가 접근 가능

다른 Origin의 응답
→ 원칙적으로 접근 제한
→ 서버가 CORS로 허용하면 접근 가능
```

## 3. CORS란 무엇인가

CORS는 Cross-Origin Resource Sharing의 약자다.

서버가 HTTP Response Header를 사용해 특정 Origin의 JavaScript에 응답을
공개해도 된다고 브라우저에 알려주는 규칙이다.

```http
Access-Control-Allow-Origin: http://localhost:5173
```

이 Header의 의미는 다음과 같다.

> `http://localhost:5173`에서 실행된 JavaScript가 이 응답을 읽는 것을
> 허용한다.

CORS를 실제로 검사하고 차단하는 주체는 브라우저다. 서버는 허용 정보를
응답 Header에 작성한다.

## 4. CORS를 설정하기 전 GET 실험

Frontend 페이지의 Console에서 실행했다.

```js
fetch("http://127.0.0.1:3001/songs")
  .then((response) => response.json())
  .then(console.log)
  .catch(console.error);
```

서버는 실제로 요청을 처리하고 다음 결과를 보냈다.

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
```

그러나 응답에 `Access-Control-Allow-Origin`이 없었기 때문에 브라우저가
JavaScript에 응답을 공개하지 않았다.

Console에서는 다음 결과를 확인했다.

```text
No 'Access-Control-Allow-Origin' header is present
GET ... net::ERR_FAILED 200 (OK)
TypeError: Failed to fetch
```

`ERR_FAILED 200 (OK)`는 모순이 아니다.

```text
HTTP 통신 관점
→ 서버가 요청을 처리하고 200 응답

브라우저 JavaScript 관점
→ CORS 검사 실패
→ fetch Promise reject
→ 응답 Body 접근 불가
```

단순한 GET 요청은 실제 서버 요청을 보낸 뒤, 받은 응답을 JavaScript에
공개할지 CORS Header로 판단할 수 있다.

## 5. Fastify에서 CORS 허용

`@fastify/cors` plugin을 등록했다.

```ts
import cors from "@fastify/cors";

const FRONTEND_ORIGIN = "http://localhost:5173";

await server.register(cors, {
  origin: FRONTEND_ORIGIN,
});
```

`origin: "*"`로 모든 Origin을 허용하지 않고 현재 Frontend Origin을
명시했다.

설정 후 같은 GET 요청의 응답에는 다음 Header가 추가됐다.

```http
Access-Control-Allow-Origin: http://localhost:5173
```

브라우저는 Request의 `Origin`과 Response의 허용 Origin을 비교하고,
일치하므로 JavaScript가 JSON Body를 읽게 했다.

## 6. CORS는 서버 요청 자체를 막는 방화벽이 아니다

첫 GET 실험에서 서버가 `200 OK`를 반환했다는 사실이 이를 보여준다.

```text
CORS의 주된 역할
→ 브라우저 JavaScript가 cross-origin 응답에 접근할 수 있는지 통제

CORS가 아닌 것
→ 사용자 인증
→ API authorization
→ 네트워크 방화벽
→ 모든 종류의 CSRF를 막는 완전한 방어책
```

`curl`과 같은 일반 HTTP client는 브라우저의 Same-Origin Policy를
시행하지 않는다. 따라서 CORS Header가 없어도 서버 응답을 읽을 수 있다.

```text
Browser fetch
→ CORS 검사함

curl
→ CORS 검사하지 않음
```

그러므로 중요한 API는 CORS만 믿어서는 안 되며 서버에서 별도의 인증과
권한 검사를 해야 한다.

## 7. Preflight란 무엇인가

Preflight는 브라우저가 실제 cross-origin 요청을 보내기 전에 수행하는
사전 허가 요청이다.

애플리케이션 코드에서 `OPTIONS`를 직접 호출한 것이 아니다. 다음 fetch를
보고 브라우저가 자동으로 필요성을 판단했다.

```js
fetch("http://127.0.0.1:3001/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "test@example.com",
    password: "1234",
  }),
});
```

`POST`는 CORS safelisted method지만 `application/json`은 safelisted
Content-Type이 아니다. 따라서 브라우저가 먼저 `OPTIONS`로 허가를
확인했다.

## 8. 실제 관찰한 Preflight Request

```http
OPTIONS /auth/login HTTP/1.1
Host: 127.0.0.1:3001
Origin: http://localhost:5173
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type
```

각 Header의 의미는 다음과 같다.

```text
Origin
→ 요청을 시도하는 JavaScript가 실행된 Origin

Access-Control-Request-Method: POST
→ 실제 요청에서 POST를 사용하고 싶음

Access-Control-Request-Headers: content-type
→ 실제 요청에서 Content-Type Header를 사용하고 싶음
```

이를 문장으로 바꾸면 다음 질문이다.

> `http://localhost:5173`에서 실행된 JavaScript가 `POST` Method와
> `Content-Type` Header를 사용해 `/auth/login`에 요청해도 되는가?

## 9. 실제 관찰한 Preflight Response

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET,HEAD,POST
Access-Control-Allow-Headers: content-type
Content-Length: 0
Vary: Access-Control-Request-Headers
```

서버의 대답은 다음과 같다.

```text
http://localhost:5173 Origin 허용
POST Method 허용
content-type Header 허용
```

`204 No Content`는 오류가 아니다. 허가 여부만 Header로 알려주므로 Response
Body가 없으며 `Content-Length`도 0이다.

`Vary: Access-Control-Request-Headers`는 cache가 Preflight 응답을 저장할
때 요청한 Header 목록에 따라 응답이 달라질 수 있음을 나타낸다.

## 10. 전체 Preflight 흐름

```text
JavaScript에서 cross-origin JSON POST fetch() 호출
↓
브라우저가 CORS safelist 조건 확인
↓
Preflight가 필요하다고 판단
↓
OPTIONS /auth/login 전송
↓
Fastify CORS plugin이 204와 허용 Header 응답
↓
브라우저가 Origin, Method, Header 허용 여부 검사
↓
모두 허용되면 실제 POST /auth/login 전송
↓
Fastify login handler가 200 응답
↓
브라우저가 실제 응답의 CORS Header도 검사
↓
fetch Promise가 최종 POST 응답으로 이행
```

Preflight의 `OPTIONS` Response를 애플리케이션 JavaScript가 직접 받는 것은
아니다. 브라우저가 내부 CORS 검사에 사용하고 `fetch()`에는 최종 요청의
응답을 제공한다.

## 11. Preflight가 실패하면

예를 들어 서버가 다음과 같이 POST를 허용하지 않는다고 가정한다.

```http
Access-Control-Allow-Methods: GET
```

그러면 브라우저는 실제 POST를 보내지 않고 `fetch()`를 CORS 오류로
실패시킨다.

```text
일반적인 safelisted GET
→ 실제 GET을 먼저 전송
→ 응답 CORS 검사 실패 시 JavaScript가 응답을 읽지 못함

Preflight가 필요한 JSON POST
→ OPTIONS 사전 검사
→ 사전 검사 실패 시 실제 POST를 보내지 않음
```

## 12. 언제 Preflight가 발생하는가

대표적으로 다음 조건에서 발생한다.

- `PUT`, `PATCH`, `DELETE`처럼 CORS safelist 밖의 Method 사용
- `Content-Type: application/json` 사용
- `Authorization` Header 사용
- 사용자 정의 Header 사용

모든 cross-origin 요청에 Preflight가 발생하는 것은 아니다. Method, Header,
Content-Type 등이 CORS safelist 조건을 만족하는 요청은 Preflight 없이 실제
요청을 보낼 수 있다. 다만 그 응답을 JavaScript가 읽으려면 여전히 올바른
CORS Response Header가 필요하다.

## 13. Preflight cache

성공한 Preflight 결과는 브라우저의 CORS-preflight cache에 저장될 수 있다.
이 cache는 일반 HTTP response cache와 구분된다.

서버가 `Access-Control-Max-Age`를 보내지 않으면 표준상 기본 max-age는
5초다. 유효한 cache entry가 있으면 브라우저는 같은 조건의 후속 요청에서
새 OPTIONS를 생략하고 실제 요청을 바로 보낼 수 있다.

Preflight를 다시 관찰할 때 URL에 현재 시간을 추가했던 이유도 cache entry와
다른 URL을 만들기 위해서다.

```js
const url = `http://127.0.0.1:3001/auth/login?test=${Date.now()}`;
```

## 14. `Host`와 `Origin`을 혼동하지 않기

현재 POST 요청에서는 두 Header가 동시에 보인다.

```http
Host: 127.0.0.1:3001
Origin: http://localhost:5173
```

| Header | 질문 | 현재 값 |
| --- | --- | --- |
| `Host` | 이 HTTP 요청이 향하는 서버는 어디인가? | `127.0.0.1:3001` |
| `Origin` | 이 요청을 시작한 브라우저 JavaScript는 어디서 왔는가? | `http://localhost:5173` |
| `Access-Control-Allow-Origin` | 서버가 어느 Origin에 응답 접근을 허용하는가? | `http://localhost:5173` |

```text
Host
→ 목적지

Origin
→ 브라우저 코드의 출처

Access-Control-Allow-Origin
→ 서버가 허용한 출처
```

## 15. 핵심 결론

```text
Same-Origin Policy는 브라우저의 기본 접근 제한이다.

CORS는 서버가 그 제한을 선택적으로 완화하는 HTTP Header 규칙이다.

서버의 200 응답과 browser fetch 성공은 서로 다른 판단이다.

Preflight는 실제 비단순 cross-origin 요청 전 브라우저가 보내는 OPTIONS다.

OPTIONS가 허용되면 실제 요청이 이어지고, 실패하면 실제 요청을 보내지 않는다.

CORS는 인증이나 권한 검사를 대신하지 않는다.
```

## 참고 자료

- [Fetch Standard: CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol)
- [Fetch Standard: CORS-preflight fetch](https://fetch.spec.whatwg.org/#cors-preflight-fetch)
- [Fetch Standard: CORS-preflight cache](https://fetch.spec.whatwg.org/#cors-preflight-cache)
- [Fastify CORS plugin](https://github.com/fastify/fastify-cors)
