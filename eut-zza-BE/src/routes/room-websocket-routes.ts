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
    },
  );
};
