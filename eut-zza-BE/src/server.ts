import http, { type IncomingMessage, type ServerResponse } from "node:http";

const HOST = "127.0.0.1";
const PORT = 3000;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
    this.name = "RequestBodyTooLargeError";
  }
}

type Song = {
  id: string;
  title: string;
};

const SONGS: Song[] = [
  {
    id: "song-1",
    title: "로보티컬 뽕짝 리듬",
  },
];

const DEMO_USER = {
  id: "user-1",
  email: "test@example.com",
  password: "1234",
};

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

type CredentialsRequestBody = {
  email: string;
  password: string;
};

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
const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
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

  if (method === "GET" && requestUrl.pathname === "/songs") {
    sendJson(response, 200, {
      songs: SONGS,
    });

    return;
  }

  const pathSegments = requestUrl.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  const songId = pathSegments[1];

  if (
    method === "GET" &&
    pathSegments.length === 2 &&
    pathSegments[0] === "songs" &&
    songId !== undefined
  ) {
    const song = SONGS.find((candidate) => candidate.id === songId);

    if (song === undefined) {
      sendJson(response, 404, {
        error: "Song Not Found",
      });

      return;
    }

    sendJson(response, 200, {
      song,
    });

    return;
  }

  if (method === "POST" && requestUrl.pathname === "/auth/signup") {
    const contentType = request.headers["content-type"];

    const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();

    if (mediaType !== "application/json") {
      // 사용하지 않을 요청 Body를 흘려보내 버린다.
      request.resume();

      sendJson(response, 415, {
        error: "Content-Type must be application/json",
      });

      return;
    }

    const body = await readRequestBody(request);

    let payload: unknown;

    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(response, 400, {
        error: "Invalid JSON",
      });

      return;
    }

    if (!isCredentialsRequestBody(payload)) {
      sendJson(response, 400, {
        error: "Invalid signup body",
      });

      return;
    }

    sendJson(response, 201, {
      user: {
        id: "user-1",
        email: payload.email,
      },
    });

    return;
  }

  if (method === "POST" && requestUrl.pathname === "/auth/login") {
    const contentType = request.headers["content-type"];
    const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();

    if (mediaType !== "application/json") {
      request.resume();

      sendJson(response, 415, {
        error: "Content-Type must be application/json",
      });

      return;
    }

    const body = await readRequestBody(request);

    let payload: unknown;

    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(response, 400, {
        error: "Invalid JSON",
      });

      return;
    }

    if (!isCredentialsRequestBody(payload)) {
      sendJson(response, 400, {
        error: "Invalid login body",
      });

      return;
    }

    const credentialsMatch =
      payload.email === DEMO_USER.email &&
      payload.password === DEMO_USER.password;

    if (!credentialsMatch) {
      sendJson(response, 401, {
        error: "Invalid email or password",
      });

      return;
    }

    sendJson(response, 200, {
      user: {
        id: DEMO_USER.id,
        email: DEMO_USER.email,
      },
    });

    return;
  }

  sendJson(response, 404, {
    error: "Not Found",
  });
};

// createServer()는 TCP 위에서 HTTP 요청을 해석하는 HTTP 서버 객체를 만든다.
// 지금 이 순간 handleRequest가 실행되는 것은 아니며, 실제 요청이 와야 호출된다.
const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (response.writableEnded) {
      return;
    }

    if (error instanceof RequestBodyTooLargeError) {
      sendJson(response, 413, {
        error: error.message,
      });

      return;
    }

    console.error("[HTTP] Unhandled request error", error);

    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "Internal Server Error",
      });

      return;
    }

    response.destroy();
  });
});

// listen()을 호출해야 운영체제에 127.0.0.1:3000 포트를 열고 요청을 기다린다.
server.listen(PORT, HOST, () => {
  console.log(`Eut-zza API server: http://${HOST}:${PORT}`);
});
