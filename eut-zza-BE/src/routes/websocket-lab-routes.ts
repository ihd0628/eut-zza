import type { FastifyPluginAsync } from "fastify";

// Week 6 연결 실험용 경로: 방, 인증, DB와 무관하게 메시지 왕복만 관찰한다.
export const websocketLabRoutes: FastifyPluginAsync = async (server) => {
  server.get("/ws/echo", { websocket: true }, (socket, request) => {
    request.log.info("WebSocket connected");

    // WebSocket 메시지는 HTTP 응답이 아니라 열린 연결의 이벤트로 도착한다.
    // 첫 메시지를 놓치지 않도록 연결 직후 동기적으로 리스너를 등록한다.
    socket.on("message", (message) => {
      socket.send(message.toString());
    });

    socket.on("close", () => {
      request.log.info("WebSocket closed");
    });
  });
};
