import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./routes/auth-routes.js";
import { gameSessionRoutes } from "./routes/game-session-routes.js";
import { healthRoutes } from "./routes/health-routes.js";
import { roomRoutes } from "./routes/room-routes.js";
import { roomWebsocketRoutes } from "./routes/room-websocket-routes.js";
import { scoreRoutes } from "./routes/score-routes.js";
import { songRoutes } from "./routes/song-routes.js";
import { userRoutes } from "./routes/user-routes.js";
import { websocketLabRoutes } from "./routes/websocket-lab-routes.js";
import { RoomStore } from "./services/room-service.js";
import { RoomPresence } from "./services/room-presence.js";

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const FRONTEND_ORIGIN = "http://localhost:5173";

// 애플리케이션의 설정과 Route를 조립하지만 네트워크 포트는 열지 않는다.
export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
    bodyLimit: MAX_REQUEST_BODY_BYTES,
  });
  // 방은 이 서버 인스턴스의 메모리에 보관한다. 이후 WebSocket 대기실도
  // 같은 RoomStore를 전달받아 HTTP 요청과 동일한 방 상태를 사용한다.
  const roomStore = new RoomStore();
  const roomPresence = new RoomPresence(roomStore);
  app.addHook("onClose", async () => roomPresence.dispose());

  // Upgrade 요청을 처리할 수 있도록 다른 Route보다 먼저 등록한다.
  await app.register(websocket);

  // 현재 API는 JSON 요청만 받으므로 Fastify의 기본 text/plain 파서를 제거한다.
  app.removeContentTypeParser("text/plain");

  // Route보다 먼저 등록해야 요청 Cookie 파싱과 reply.setCookie()를 사용할 수 있다.
  await app.register(cookie);

  await app.register(cors, {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "HEAD", "POST", "PATCH"],
    // 브라우저가 다른 Origin의 API에 Cookie를 보내고 받을 수 있게 허용한다.
    credentials: true,
  });

  // 각 요청마다 인증된 사용자를 안전하게 저장할 자리를 만든다.
  app.decorateRequest("authenticatedUser", null);

  await app.register(healthRoutes);
  await app.register(websocketLabRoutes);
  await app.register(authRoutes, { roomPresence });
  await app.register(songRoutes);
  await app.register(roomRoutes, { roomStore, roomPresence });
  await app.register(roomWebsocketRoutes, { roomStore, roomPresence });
  await app.register(gameSessionRoutes);
  await app.register(scoreRoutes);
  await app.register(userRoutes);

  return app;
};
