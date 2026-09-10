import http, {
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const HOST = "127.0.0.1";
const PORT = 3000;

/**
 * JavaScript 객체를 HTTP 응답으로 전송한다.
 *
 * HTTP 응답은 크게 Status Code, Header, Body로 구성된다.
 * ServerResponse에 이 세 정보를 설정한 뒤 end()를 호출하면
 * Node.js가 클라이언트로 응답을 전송하고 응답 스트림을 종료한다.
 */
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

/**
 * 클라이언트의 HTTP 요청이 도착할 때마다 호출되는 함수다.
 *
 * request는 IncomingMessage이며 클라이언트가 보낸 요청을 나타낸다.
 * 요청 Body가 있다면 읽을 수 있는 Readable Stream이기도 하다.
 * 이번 GET /health 요청에는 Body가 없으므로 method와 url만 확인한다.
 *
 * response는 ServerResponse이며 클라이언트에게 보낼 응답을 나타낸다.
 * status, header, body를 작성하고 end()로 응답을 끝낸다.
 */
const handleRequest = (
  request: IncomingMessage,
  response: ServerResponse,
): void => {
  const method = request.method ?? "UNKNOWN";

  // request.url에는 일반적으로 /health?foo=bar처럼 경로와 Query String이 들어온다.
  // URL 객체로 변환하면 pathname과 searchParams를 나눠서 다룰 수 있다.
  const requestUrl = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

  console.log(`[HTTP] ${method} ${requestUrl.pathname}`);

  if (method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "eut-zza-be",
    });

    return;
  }

  sendJson(response, 404, {
    error: "Not Found",
  });
};

// createServer()는 TCP 위에서 HTTP 요청을 해석하는 HTTP 서버 객체를 만든다.
// 지금 이 순간 handleRequest가 실행되는 것은 아니며, 실제 요청이 와야 호출된다.
const server = http.createServer(handleRequest);

// listen()을 호출해야 운영체제에 127.0.0.1:3000 포트를 열고 요청을 기다린다.
server.listen(PORT, HOST, () => {
  console.log(`Eut-zza API server: http://${HOST}:${PORT}`);
});
