# eut-zza-BE

Week 3의 HTTP, Network, Node.js 학습을 위한 백엔드 프로젝트다.

처음부터 Fastify를 사용하지 않고 Node.js 내장 `node:http` 모듈로 서버를 만든다. 프레임워크가 대신 처리해 주는 HTTP 요청과 응답의 기본 구조를 먼저 확인하는 것이 목적이다.

## 실행 방법

개발 서버를 실행한다.

```bash
npm run dev
```

다른 터미널이나 브라우저에서 다음 주소로 요청한다.

```text
http://127.0.0.1:3000/health
```

헤더까지 터미널에서 확인하려면 다음 명령을 사용한다.

```bash
curl -i http://127.0.0.1:3000/health
```

예상 Body는 다음과 같다.

```json
{
  "status": "ok",
  "service": "eut-zza-be"
}
```

존재하지 않는 경로는 `404 Not Found`를 반환한다.

```bash
curl -i http://127.0.0.1:3000/unknown
```

## 현재 확인할 개념

- `http.createServer()`는 무엇을 생성하는가?
- 서버 시작 시점이 아니라 요청이 올 때 `handleRequest()`가 실행되는 이유는 무엇인가?
- `IncomingMessage`에서 method, URL, header, body를 어떻게 얻는가?
- `IncomingMessage`가 Readable Stream인 이유는 무엇인가?
- `ServerResponse`에 status code, header, body를 어떻게 작성하는가?
- `response.end()`를 호출해야 하는 이유는 무엇인가?
- `server.listen()`과 TCP 포트는 어떤 관계인가?

## 아직 의도적으로 넣지 않은 것

- Fastify
- CORS Header
- 회원가입과 로그인
- 데이터베이스
- `GET /songs`

각 기능은 기본 HTTP 흐름을 확인한 다음 로드맵 순서대로 추가한다.
