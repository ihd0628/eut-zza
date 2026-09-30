import type { FastifyPluginAsync } from "fastify";
import { BeatmapNotFoundError } from "../domain/game-session.js";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../hooks/authentication.js";
import { startSoloGame } from "../services/game-session-service.js";

type StartSoloGameBody = {
  beatmapId: string;
};

const startSoloGameBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["beatmapId"],
  properties: {
    beatmapId: {
      type: "string",
      pattern: "^[1-9][0-9]*$",
      maxLength: 18,
    },
  },
} as const;

export const gameSessionRoutes: FastifyPluginAsync = async (server) => {
  server.post<{ Body: StartSoloGameBody }>(
    "/game-sessions/solo",
    {
      preHandler: authenticateRequest,
      schema: {
        body: startSoloGameBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const startedGame = await startSoloGame(
          user.id,
          request.body.beatmapId,
        );

        return reply.code(201).send(startedGame);
      } catch (error: unknown) {
        if (error instanceof BeatmapNotFoundError) {
          return reply.code(404).send({
            error: error.message,
          });
        }

        throw error;
      }
    },
  );
};
