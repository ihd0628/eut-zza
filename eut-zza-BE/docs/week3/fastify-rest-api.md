# raw HTTP 서버에서 Fastify REST API로 이동하기

> 관련 코드: `src/fastify-server.ts`
>
> 실행 명령: `npm run dev:fastify`
>
> 서버 주소: `http://127.0.0.1:3001`

## 1. Fastify를 나중에 사용한 이유

raw Node.js 서버에서 HTTP 요청과 응답을 직접 처리한 뒤 Fastify로 같은
API를 다시 만들었다.

목적은 단순히 코드를 짧게 만드는 것이 아니라, 프레임워크가 어떤 기본
작업을 대신하는지 구분하는 것이다.

```text
raw Node.js 서버
→ HTTP의 기본 동작을 직접 확인

Fastify 서버
→ 반복되는 저수준 처리를 프레임워크에 맡김
→ 애플리케이션의 라우트와 규칙에 집중
```

## 2. `Fastify()`와 `server.listen()`

```ts
const server = Fastify({
  logger: true,
  bodyLimit: 16 * 1024,
});
```

`Fastify()`는 Node.js HTTP server, router, plugin 시스템, request/reply
추상화 등을 포함한 Fastify 인스턴스를 만든다.

이 코드만으로 handler가 실행되거나 포트가 열리는 것은 아니다.

```ts
const address = await server.listen({
  host: "127.0.0.1",
  port: 3001,
});
```

`listen()`을 호출해야 서버가 포트를 열고 요청을 기다린다. 반환된 Promise를
`await`하면 다음 일을 시작 전에 확인할 수 있다.

- 포트가 정상적으로 열렸는가?
- 이미 다른 프로세스가 같은 포트를 사용하고 있지 않은가?
- startup 과정에서 오류가 발생하지 않았는가?
- 실제 listening이 완료된 뒤 다음 코드를 실행하는가?

`await`가 없더라도 listen 작업 자체는 시작될 수 있지만, 그 완료나 실패를
현재 async 흐름에서 순서대로 처리하기 어렵다.

## 3. Route 등록과 handler 실행 시점

```ts
server.get("/health", () => {
  return {
    status: "ok",
    service: "eut-zza-be",
  };
});
```

`server.get()`을 호출하는 시점에는 라우트 정보와 handler를 등록할 뿐이다.
handler는 실제로 일치하는 요청이 도착했을 때 실행된다.

```text
프로그램 시작
→ GET /health 라우트 등록
→ handler 함수는 아직 실행되지 않음

클라이언트가 GET /health 요청
→ Fastify router가 일치하는 라우트 탐색
→ handler 함수 호출
```

## 4. 객체만 반환해도 JSON 응답이 되는 이유

raw 서버에서는 직접 다음 코드를 작성했다.

```ts
const body = JSON.stringify(payload);
response.statusCode = 200;
response.setHeader("Content-Type", "application/json; charset=utf-8");
response.setHeader("Content-Length", Buffer.byteLength(body));
response.end(body);
```

Fastify handler에서는 객체를 반환하거나 `reply.send()`에 전달할 수 있다.

```ts
return {
  songs: SONGS,
};
```

Fastify가 다음 일을 처리한다.

```text
반환값 확인
→ JSON 응답으로 직렬화
→ Content-Type 설정
→ Content-Length 계산
→ Node.js response에 기록
→ HTTP 응답 완료
```

상태 코드를 바꾸고 싶다면 `reply.code()`를 사용한다.

```ts
return reply.code(201).send({
  user,
});
```

## 5. Path parameter

raw 서버에서는 다음처럼 경로를 직접 분해했다.

```text
/songs/song-1
→ ["songs", "song-1"]
→ 두 번째 segment를 songId로 사용
```

Fastify에서는 라우트에 parameter를 선언한다.

```ts
server.get<{ Params: SongParams }>("/songs/:id", (request, reply) => {
  const songId = request.params.id;
});
```

```text
GET /songs/song-1
→ /songs/:id와 일치
→ request.params.id === "song-1"
```

## 6. Content-Type parser

Fastify는 기본적으로 `application/json`과 `text/plain` parser를 제공한다.
JSON 요청에서는 다음 일을 대신한다.

```text
Request Body Stream 읽기
→ Body 크기 확인
→ UTF-8 데이터 처리
→ JSON parsing
→ 결과를 request.body에 저장
```

따라서 handler에서 `JSON.parse()`를 다시 호출하지 않는다.

현재 API는 JSON Body만 받기로 했으므로 기본 `text/plain` parser를
제거했다.

```ts
server.removeContentTypeParser("text/plain");
```

그 결과 다음 요청은 handler에 도달하기 전에 거절된다.

```http
Content-Type: text/plain
```

```http
HTTP/1.1 415 Unsupported Media Type
code: FST_ERR_CTP_INVALID_MEDIA_TYPE
```

## 7. Body 크기 제한

```ts
const server = Fastify({
  bodyLimit: 16 * 1024,
});
```

raw 서버에서 `data` 이벤트마다 직접 바이트를 세던 일을 Fastify의 Body
reader에 맡겼다.

```text
Body가 제한 이내
→ parser 실행

Body가 제한 초과
→ request.body 구성 중단
→ 413 Payload Too Large
```

현재 16 KiB는 이 학습용 JSON API에 맞춰 명시한 값이다. Fastify의 기본
전역 제한은 1 MiB다.

## 8. TypeScript type과 JSON Schema는 역할이 다르다

라우트에는 다음 두 종류의 정보가 있다.

```ts
type CredentialsRequestBody = {
  email: string;
  password: string;
};
```

```ts
const credentialsBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: {
      type: "string",
      minLength: 1,
    },
    password: {
      type: "string",
      minLength: 1,
    },
  },
} as const;
```

역할은 다음과 같다.

```text
CredentialsRequestBody
→ TypeScript compile-time 검사
→ handler를 작성하는 개발자를 도움
→ 외부 HTTP 요청을 실제로 막지는 못함

credentialsBodySchema
→ 서버 runtime 검사
→ 실제 외부 JSON 데이터의 구조를 검증
→ 실패하면 handler 실행 전에 400 응답
```

외부 클라이언트는 TypeScript 타입을 볼 수도 있고 따를 의무도 없다.
따라서 API 경계에서는 런타임 검증이 필요하다.

### Schema 속성의 의미

```text
type: "object"
→ JSON 객체여야 함

required: ["email", "password"]
→ 두 속성이 반드시 존재해야 함

properties.email/password.type: "string"
→ 값이 문자열이어야 함

minLength: 1
→ 빈 문자열은 허용하지 않음

additionalProperties: false
→ Schema에 선언하지 않은 추가 속성을 허용하지 않음
```

다만 “허용하지 않는다”가 현재 Fastify 기본 설정에서 항상 `400`을
반환한다는 뜻은 아니다. Fastify가 기본으로 사용하는 Ajv 설정에는
`removeAdditional: true`가 있다. 따라서 현재 서버에서는 추가 속성을
거절하기보다 검증 결과에서 제거한다.

예를 들어 다음 `nickname`은 handler가 실행되기 전에 Body에서
제거된다.

```json
{
  "email": "test@example.com",
  "password": "1234",
  "nickname": "eut-zza"
}
```

그런 다음 `email`과 `password`는 Schema에 유효하므로 handler가 실행되고
현재 코드는 `201 Created`를 반환한다. 추가 속성을 반드시 오류로
거절하고 싶다면 Ajv 설정과 Fastify validation 전략을 별도로
결정해야 한다.

`as const`는 `"object"`, `"string"` 같은 값이 일반 `string`으로 넓어지지
않고 문자열 literal type으로 유지되게 한다.

TypeScript type과 JSON Schema는 현재 직접 두 번 작성했기 때문에 둘이
서로 어긋날 수 있다. 지금은 두 검사의 차이를 배우기 위해 이 구조를
사용하고, 필요해지면 이후 단계에서 type provider나 schema 도구를 검토할
수 있다.

## 9. Fastify 요청 처리 흐름

현재 코드에서 중요한 흐름을 단순화하면 다음과 같다.

```text
HTTP 요청 도착
↓
Fastify router가 Method와 URL 확인
↓
Content-Type에 맞는 parser 선택
↓
Body 크기 제한 확인 및 Stream 수집
↓
JSON parsing
↓
JSON Schema runtime validation
↓
Route handler 실행
↓
handler 반환값 또는 reply.send() 처리
↓
JSON HTTP 응답
```

CORS plugin의 hook과 다른 Fastify lifecycle hook이 추가되면 일부 작업은
이 흐름 앞뒤에 더 들어갈 수 있다.

## 10. 실제 실험으로 구분한 오류 단계

### 정상 회원가입

```json
{
  "email": "test@example.com",
  "password": "1234"
}
```

```http
HTTP/1.1 201 Created

{"user":{"id":"user-1","email":"test@example.com"}}
```

### 필수 속성 누락

```json
{
  "password": "1234"
}
```

```http
HTTP/1.1 400 Bad Request
code: FST_ERR_VALIDATION
message: body must have required property 'email'
```

Schema 단계에서 실패했으므로 회원가입 handler는 실행되지 않는다.

### 올바른 구조지만 로그인 정보 불일치

```json
{
  "email": "test@example.com",
  "password": "wrong"
}
```

```http
HTTP/1.1 401 Unauthorized

{"error":"Invalid email or password"}
```

Schema는 통과했고 로그인 handler가 실행된 뒤 애플리케이션 규칙으로
`401`을 반환했다.

### 지원하지 않는 Content-Type

```http
Content-Type: text/plain
```

```http
HTTP/1.1 415 Unsupported Media Type
code: FST_ERR_CTP_INVALID_MEDIA_TYPE
```

Body 안의 `password` 철자가 맞는지 검사하기 전, Content-Type parser 선택
단계에서 거절된다.

### JSON의 속성명 오타

```json
{
  "email": "test@example.com",
  "passworsd": "wrong"
}
```

```http
HTTP/1.1 400 Bad Request
code: FST_ERR_VALIDATION
message: body must have required property 'password'
```

JSON parsing은 성공하지만 Schema에서 필수 `password`가 없다고 판단한다.

### Schema에 없는 추가 속성

```json
{
  "email": "test@example.com",
  "password": "1234",
  "nickname": "eut-zza"
}
```

```http
HTTP/1.1 201 Created

{"user":{"id":"user-1","email":"test@example.com"}}
```

실제 현재 서버에 요청해 확인한 결과다. `additionalProperties: false`와
Fastify 기본 Ajv의 `removeAdditional: true`가 함께 적용되어
`nickname`이 제거된 뒤 handler가 실행된다.

## 11. raw 서버와 Fastify 비교

| raw Node.js에서 직접 한 일 | Fastify에서 담당하는 기능 |
| --- | --- |
| `data`, `end`로 Body 수집 | Content-Type parser와 Body reader |
| UTF-8 문자열 구성 | parser |
| `JSON.parse()` | 기본 JSON parser |
| 수신 바이트 직접 누적 | `bodyLimit` |
| type guard로 데이터 검사 | JSON Schema validation |
| Method와 pathname 비교 | `server.get()`, `server.post()` router |
| path segment 직접 분리 | `request.params` |
| `JSON.stringify()`와 Header 작성 | 반환값과 `reply.send()` 처리 |
| Status Code 직접 대입 | `reply.code()` |
| 예상 가능한 기본 오류 직접 응답 | Fastify 기본 error handler |

Fastify가 이 작업들을 대신해도 하부에서 HTTP 요청 Stream을 읽고 HTTP
응답 Stream에 쓰는 과정이 사라지는 것은 아니다. 프레임워크가 그 코드를
대신 실행하는 것이다.

## 12. 현재 인증 API의 범위

현재 회원가입과 로그인은 HTTP Method, Body parsing, validation, Status
Code를 학습하기 위한 임시 구현이다.

아직 다음 기능은 없다.

- 데이터베이스 사용자 저장
- 비밀번호 hash
- Session 또는 JWT
- Cookie 발급
- 실제 인증 상태 유지

이 기능들은 Week 5의 Authentication 단계에서 다룬다.

## 13. 핵심 결론

```text
Fastify는 HTTP를 없애는 것이 아니라 반복되는 HTTP 처리 코드를 대신한다.

route handler는 등록 시점이 아니라 일치하는 요청이 도착했을 때 실행된다.

request.body는 Fastify가 Body Stream을 읽고 parsing한 결과다.

TypeScript type은 runtime 보안 장치가 아니다.

JSON Schema는 실제 외부 입력을 runtime에 검증한다.

Schema 실패와 로그인 자격 증명 실패는 서로 다른 처리 단계다.
```

## 참고 자료

- [Fastify Content-Type Parser](https://fastify.dev/docs/latest/Reference/ContentTypeParser/)
- [Fastify Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify Server의 bodyLimit](https://fastify.dev/docs/latest/Reference/Server/#bodylimit)
