import type { FastifyPluginAsync } from "fastify";
import {
  BeatmapNotFoundError,
  SoloGameCompletionForbiddenError,
  SoloGameNotFoundError,
  SoloGameNotPlayingError,
} from "../domain/game-session.js";
import {
  GamePlayerNotFoundError,
  ScoreAlreadyExistsError,
  type CreateScoreInput,
} from "../domain/score.js";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../hooks/authentication.js";
import {
  completeSoloGame,
  startSoloGame,
} from "../services/game-session-service.js";

type StartSoloGameBody = {
  beatmapId: string;
};

type CompleteSoloGameParams = {
  id: string;
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

const nonNegativeIntegerSchema = {
  type: "integer",
  minimum: 0,
  maximum: 2_147_483_647,
} as const;

const completeSoloGameParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: {
      type: "string",
      pattern: "^[1-9][0-9]*$",
      maxLength: 18,
    },
  },
} as const;

const completeSoloGameBodySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "gamePlayerId",
    "score",
    "perfectCount",
    "greatCount",
    "goodCount",
    "missCount",
    "maxCombo",
  ],
  properties: {
    gamePlayerId: {
      type: "string",
      pattern: "^[1-9][0-9]*$",
      maxLength: 18,
    },
    score: nonNegativeIntegerSchema,
    perfectCount: nonNegativeIntegerSchema,
    greatCount: nonNegativeIntegerSchema,
    goodCount: nonNegativeIntegerSchema,
    missCount: nonNegativeIntegerSchema,
    maxCombo: nonNegativeIntegerSchema,
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

  server.post<{
    Params: CompleteSoloGameParams;
    Body: CreateScoreInput;
  }>(
    "/game-sessions/solo/:id/complete",
    {
      preHandler: authenticateRequest,
      schema: {
        params: completeSoloGameParamsSchema,
        body: completeSoloGameBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        const completedGame = await completeSoloGame(user.id, {
          gameSessionId: request.params.id,
          ...request.body,
        });

        return reply.code(200).send(completedGame);
      } catch (error: unknown) {
        if (
          error instanceof SoloGameNotFoundError ||
          error instanceof GamePlayerNotFoundError
        ) {
          return reply.code(404).send({
            error: error.message,
          });
        }

        if (error instanceof SoloGameCompletionForbiddenError) {
          return reply.code(403).send({
            error: error.message,
          });
        }

        if (
          error instanceof SoloGameNotPlayingError ||
          error instanceof ScoreAlreadyExistsError
        ) {
          return reply.code(409).send({
            error: error.message,
          });
        }

        throw error;
      }
    },
  );
};
