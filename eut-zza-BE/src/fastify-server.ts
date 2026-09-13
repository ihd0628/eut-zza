import Fastify from "fastify";

const HOST = "127.0.0.1";
const PORT = 3001;

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
});

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
