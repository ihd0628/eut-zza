import { buildApp } from "./app.js";

const HOST = "127.0.0.1";
const PORT = 3001;

const start = async (): Promise<void> => {
  const app = await buildApp();

  try {
    const address = await app.listen({
      host: HOST,
      port: PORT,
    });

    app.log.info(`Eut-zza Fastify API server: ${address}`);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
};

// start() 내부에서 listen 오류를 처리하므로 반환된 Promise는 의도적으로 기다리지 않는다.
void start();
