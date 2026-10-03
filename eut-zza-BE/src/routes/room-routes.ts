import type { FastifyPluginAsync } from "fastify";
import {
  RoomFullError,
  RoomNotFoundError,
  RoomNotJoinableError,
  RoomParticipantNotFoundError,
  UserAlreadyInRoomError,
} from "../domain/room.js";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../hooks/authentication.js";
import type { RoomStore } from "../services/room-service.js";
import type { RoomPresence } from "../services/room-presence.js";

type RoomRoutesOptions = {
  roomStore: RoomStore;
  roomPresence: RoomPresence;
};

type RoomParams = {
  id: string;
};

const roomParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: {
      type: "string",
      pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    },
  },
} as const;

export const roomRoutes: FastifyPluginAsync<RoomRoutesOptions> = async (
  server,
  { roomStore, roomPresence },
) => {
  server.get(
    "/rooms",
    { preHandler: authenticateRequest },
    async () => ({ rooms: roomStore.listRooms() }),
  );

  server.get<{ Params: RoomParams }>(
    "/rooms/:id",
    {
      preHandler: authenticateRequest,
      schema: { params: roomParamsSchema },
    },
    async (request, reply) => {
      const room = roomStore.getRoom(request.params.id);

      if (room === undefined) {
        return reply.code(404).send({ error: "Room not found" });
      }

      const user = getAuthenticatedRequestUser(request);
      if (!room.participants.some((participant) => participant.userId === user.id)) {
        return reply.code(403).send({ error: "You are not a participant in this room" });
      }

      return { room };
    },
  );

  server.post(
    "/rooms",
    { preHandler: authenticateRequest },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const room = roomStore.createRoom(user.id);
        roomPresence.expectConnection(room.id, user.id);

        return reply.code(201).send({ room });
      } catch (error: unknown) {
        if (error instanceof UserAlreadyInRoomError) {
          return reply.code(409).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  server.post<{ Params: RoomParams }>(
    "/rooms/:id/join",
    {
      preHandler: authenticateRequest,
      schema: { params: roomParamsSchema },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const room = roomStore.joinRoom(request.params.id, user.id);
        roomPresence.expectConnection(room.id, user.id);
        roomPresence.broadcastRoom(room.id);

        return { room };
      } catch (error: unknown) {
        if (error instanceof RoomNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }

        if (
          error instanceof RoomFullError ||
          error instanceof RoomNotJoinableError ||
          error instanceof UserAlreadyInRoomError
        ) {
          return reply.code(409).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  server.post<{ Params: RoomParams }>(
    "/rooms/:id/leave",
    {
      preHandler: authenticateRequest,
      schema: { params: roomParamsSchema },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const room = roomPresence.leaveRoom(request.params.id, user.id);
        return { room };
      } catch (error: unknown) {
        if (error instanceof RoomNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }

        if (error instanceof RoomParticipantNotFoundError) {
          return reply.code(403).send({ error: error.message });
        }

        throw error;
      }
    },
  );
};
