import type { FastifyPluginAsync } from "fastify";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../hooks/authentication.js";
import type { RoomPresence } from "../services/room-presence.js";
import type { RoomStore } from "../services/room-service.js";

type RoomWebsocketRoutesOptions = {
  roomStore: RoomStore;
  roomPresence: RoomPresence;
};

type RoomParams = {
  id: string;
};

export const roomWebsocketRoutes: FastifyPluginAsync<RoomWebsocketRoutesOptions> = async (
  server,
  { roomStore, roomPresence },
) => {
  server.get<{ Params: RoomParams }>(
    "/ws/rooms/:id",
    {
      websocket: true,
      preHandler: authenticateRequest,
    },
    (socket, request) => {
      const user = getAuthenticatedRequestUser(request);
      const room = roomStore.getRoom(request.params.id);

      if (!room?.participants.some((participant) => participant.userId === user.id)) {
        socket.close(1008, "Room membership required");
        return;
      }

      // 연결 직후 리스너를 등록해 새로고침으로 소켓이 교체되는 경우를 추적한다.
      roomPresence.attach(room.id, user.id, socket);

      // 브라우저 시계와 서버 시계의 차이를 추정하기 위한 애플리케이션 메시지다.
      // WebSocket 프로토콜의 Ping/Pong heartbeat와 목적이 다르다.
      socket.on("message", (rawData, isBinary) => {
        if (isBinary) return;

        try {
          const message = JSON.parse(rawData.toString()) as {
            type?: unknown;
            clientSentAtMs?: unknown;
          };

          if (
            message.type === "time_sync" &&
            typeof message.clientSentAtMs === "number" &&
            Number.isFinite(message.clientSentAtMs)
          ) {
            socket.send(JSON.stringify({
              type: "time_sync",
              clientSentAtMs: message.clientSentAtMs,
              serverTimeMs: Date.now(),
            }));
          }
        } catch {
          // 이후 게임 메시지와 독립적으로, 알 수 없는 형식은 이 단계에서 무시한다.
        }
      });

      // 새 소켓은 새로고침으로 만들어졌을 수도 있으므로 이전 탭의 음원 준비 상태를
      // 그대로 신뢰하지 않는다. 실제 AudioBuffer를 다시 준비한 뒤 재등록해야 한다.
      if (roomStore.clearAudioPrepared(room.id, user.id) !== undefined) {
        roomPresence.broadcastRoom(room.id);
      }
    },
  );
};
