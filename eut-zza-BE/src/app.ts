import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
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

  // Route보다 먼저 등록해야 요청 Cookie 파싱과 reply.setCookie()를 사용할 수 있다.
  await app.register(cookie);

  await app.register(cors, {
    origin: FRONTEND_ORIGIN,
    // 브라우저가 다른 Origin의 API에 Cookie를 보내고 받을 수 있게 허용한다.
    credentials: true,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(songRoutes);
  await app.register(scoreRoutes);
  await app.register(userRoutes);

  return app;
};
