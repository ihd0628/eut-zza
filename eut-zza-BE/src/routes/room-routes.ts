import type { FastifyPluginAsync } from "fastify";
import {
  RoomAudioNotPreparedError,
  RoomBeatmapChangedError,
  RoomBeatmapNotSelectedError,
  RoomFullError,
  RoomHostRequiredError,
  RoomNotEnoughParticipantsError,
  RoomNotFoundError,
  RoomNotJoinableError,
  RoomNotWaitingError,
  RoomParticipantNotFoundError,
  RoomParticipantsNotReadyError,
  RoomSelectionLockedError,
  UserAlreadyInRoomError,
} from "../domain/room.js";
import { BeatmapNotFoundError } from "../domain/game-session.js";
import { beatmapExists } from "../repositories/beatmap-repository.js";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../hooks/authentication.js";
import type { RoomStore } from "../services/room-service.js";
import type { RoomPresence } from "../services/room-presence.js";
import { startMultiplayerGame } from "../services/game-session-service.js";

type RoomRoutesOptions = {
  roomStore: RoomStore;
  roomPresence: RoomPresence;
};

type RoomParams = {
  id: string;
};

type SelectBeatmapBody = { beatmapId: string };
type SetReadyBody = { beatmapId: string; ready: boolean };

const beatmapIdSchema = {
  type: "string",
  pattern: "^[1-9][0-9]*$",
  maxLength: 18,
} as const;

const selectionBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["beatmapId"],
  properties: { beatmapId: beatmapIdSchema },
} as const;

const readyBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["beatmapId", "ready"],
  properties: {
    beatmapId: beatmapIdSchema,
    ready: { type: "boolean" },
  },
} as const;

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

  server.patch<{ Params: RoomParams; Body: SelectBeatmapBody }>(
    "/rooms/:id/selection",
    {
      preHandler: authenticateRequest,
      schema: { params: roomParamsSchema, body: selectionBodySchema },
    },
    async (request, reply) => {
      const user = getAuthenticatedRequestUser(request);
      const currentRoom = roomStore.getRoom(request.params.id);
      if (currentRoom === undefined) {
        return reply.code(404).send({ error: "Room not found" });
      }
      if (currentRoom.hostUserId !== user.id) {
        return reply.code(403).send({ error: "Only the room host can select a beatmap" });
      }
      if (!await beatmapExists(request.body.beatmapId)) {
        return reply.code(404).send({ error: "Beatmap not found" });
      }

      try {
        // DB 조회 중 방장이 바뀌었더라도 Store에서 권한과 잠금 상태를 다시 검사한다.
        const room = roomStore.selectBeatmap(request.params.id, user.id, request.body.beatmapId);
        roomPresence.broadcastRoom(room.id);
        return { room };
      } catch (error: unknown) {
        if (error instanceof RoomNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }
        if (error instanceof RoomHostRequiredError) {
          return reply.code(403).send({ error: error.message });
        }
        if (error instanceof RoomNotWaitingError || error instanceof RoomSelectionLockedError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.patch<{ Params: RoomParams; Body: SetReadyBody }>(
    "/rooms/:id/ready",
    {
      preHandler: authenticateRequest,
      schema: { params: roomParamsSchema, body: readyBodySchema },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const room = roomStore.setReady(
          request.params.id,
          user.id,
          request.body.beatmapId,
          request.body.ready,
        );
        roomPresence.broadcastRoom(room.id);
        return { room };
      } catch (error: unknown) {
        if (error instanceof RoomNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }
        if (error instanceof RoomParticipantNotFoundError) {
          return reply.code(403).send({ error: error.message });
        }
        if (
          error instanceof RoomNotWaitingError ||
          error instanceof RoomBeatmapNotSelectedError ||
          error instanceof RoomBeatmapChangedError
        ) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.patch<{ Params: RoomParams; Body: SelectBeatmapBody }>(
    "/rooms/:id/audio-prepared",
    {
      preHandler: authenticateRequest,
      schema: { params: roomParamsSchema, body: selectionBodySchema },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const room = roomStore.markAudioPrepared(
          request.params.id,
          user.id,
          request.body.beatmapId,
        );
        roomPresence.broadcastRoom(room.id);
        return { room };
      } catch (error: unknown) {
        if (error instanceof RoomNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }
        if (error instanceof RoomParticipantNotFoundError) {
          return reply.code(403).send({ error: error.message });
        }
        if (
          error instanceof RoomNotWaitingError ||
          error instanceof RoomBeatmapNotSelectedError ||
          error instanceof RoomBeatmapChangedError
        ) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.post<{ Params: RoomParams }>(
    "/rooms/:id/start",
    {
      preHandler: authenticateRequest,
      schema: { params: roomParamsSchema },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const room = await startMultiplayerGame(roomStore, request.params.id, user.id);
        roomPresence.broadcastRoom(room.id);
        return reply.code(201).send({ room });
      } catch (error: unknown) {
        if (error instanceof RoomNotFoundError || error instanceof BeatmapNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }
        if (error instanceof RoomHostRequiredError) {
          return reply.code(403).send({ error: error.message });
        }
        if (
          error instanceof RoomNotWaitingError ||
          error instanceof RoomBeatmapNotSelectedError ||
          error instanceof RoomNotEnoughParticipantsError ||
          error instanceof RoomParticipantsNotReadyError ||
          error instanceof RoomAudioNotPreparedError
        ) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );
};
