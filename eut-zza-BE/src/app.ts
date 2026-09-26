import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./routes/auth-routes.js";
import { healthRoutes } from "./routes/health-routes.js";
import { scoreRoutes } from "./routes/score-routes.js";
import { songRoutes } from "./routes/song-routes.js";
import { userRoutes } from "./routes/user-routes.js";

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const FRONTEND_ORIGIN = "http://localhost:5173";

// 애플리케이션의 설정과 Route를 조립하지만 네트워크 포트는 열지 않는다.
export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
    bodyLimit: MAX_REQUEST_BODY_BYTES,
  });

  // 현재 API는 JSON 요청만 받으므로 Fastify의 기본 text/plain 파서를 제거한다.
  app.removeContentTypeParser("text/plain");

  await app.register(cors, {
    origin: FRONTEND_ORIGIN,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(songRoutes);
  await app.register(scoreRoutes);
  await app.register(userRoutes);

  return app;
};
