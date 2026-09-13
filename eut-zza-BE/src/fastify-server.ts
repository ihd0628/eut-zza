import Fastify from "fastify";

const HOST = "127.0.0.1";
const PORT = 3001;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

type CredentialsRequestBody = {
  email: string;
  password: string;
};

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

const DEMO_USER = {
  id: "user-1",
  email: "test@example.com",
  password: "1234",
};

type Song = {
  id: string;
  title: string;
};

type SongParams = {
  id: string;
};

const SONGS: Song[] = [
  {
    id: "song-1",
    title: "로보티컬 뽕짝 리듬",
  },
];

// Fastify 인스턴스 내부에는 Node.js HTTP server와 라우터 등이 들어 있다.
// logger를 켜면 요청과 응답에 대한 구조화된 로그를 확인할 수 있다.
const server = Fastify({
  logger: true,
  bodyLimit: MAX_REQUEST_BODY_BYTES,
});

// Fastify는 기본적으로 application/json뿐 아니라 text/plain도 읽을 수 있다. 하지만 현재 인증 API는 JSON 전용이므로 text/plain 파서를 제거한다.
// 그러면 Content-Type: text/plain 요청은 자동으로 415 Unsupported Media Type이 된다
server.removeContentTypeParser("text/plain");

// raw 서버에서 method와 pathname을 직접 비교했던 작업을
// Fastify의 get() 메서드가 라우트 등록 형태로 대신한다.
server.get("/health", () => {
  // 객체를 반환하면 Fastify가 JSON 직렬화와 응답 Header 설정,
  // response.end()에 해당하는 응답 완료 작업을 처리한다.
  return {
    status: "ok",
    service: "eut-zza-be",
  };
});

server.get("/songs", () => {
  return {
    songs: SONGS,
  };
});

server.get<{ Params: SongParams }>("/songs/:id", (request, reply) => {
  const song = SONGS.find((candidate) => candidate.id === request.params.id);

  if (song === undefined) {
    return reply.code(404).send({
      error: "Song Not Found",
    });
  }

  return {
    song,
  };
});

server.post<{ Body: CredentialsRequestBody }>(
  "/auth/signup",
  {
    schema: {
      body: credentialsBodySchema,
    },
  },
  (request, reply) => {
    return reply.code(201).send({
      user: {
        id: "user-1",
        email: request.body.email,
      },
    });
  },
);

server.post<{ Body: CredentialsRequestBody }>(
  "/auth/login",
  {
    schema: {
      body: credentialsBodySchema,
    },
  },
  (request, reply) => {
    const credentialsMatch =
      request.body.email === DEMO_USER.email &&
      request.body.password === DEMO_USER.password;

    if (!credentialsMatch) {
      return reply.code(401).send({
        error: "Invalid email or password",
      });
    }

    return {
      user: {
        id: DEMO_USER.id,
        email: DEMO_USER.email,
      },
    };
  },
);

const start = async (): Promise<void> => {
  try {
    const address = await server.listen({
      host: HOST,
      port: PORT,
    });

    server.log.info(`Eut-zza Fastify API server: ${address}`);
  } catch (error) {
    server.log.error(error);
    process.exitCode = 1;
  }
};

// start() 내부에서 listen 오류를 처리하므로 반환된 Promise는 의도적으로 기다리지 않는다.
void start();
