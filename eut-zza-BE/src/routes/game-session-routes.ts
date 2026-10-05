import type { FastifyPluginAsync } from "fastify";
import {
  BeatmapNotFoundError,
  MultiplayerGameCompletionForbiddenError,
  MultiplayerGameNotFoundError,
  MultiplayerGameNotPlayingError,
  MultiplayerResultConflictError,
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
  getSoloSavedResult,
  startSoloGame,
} from "../services/game-session-service.js";
import type { MultiplayerGameCoordinator } from "../services/multiplayer-game-coordinator.js";

type StartSoloGameBody = {
  beatmapId: string;
};

type CompleteSoloGameParams = {
  id: string;
};

type GameSessionRoutesOptions = {
  multiplayerGameCoordinator: MultiplayerGameCoordinator;
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

export const gameSessionRoutes: FastifyPluginAsync<GameSessionRoutesOptions> = async (
  server,
  { multiplayerGameCoordinator },
) => {
  server.get<{ Params: CompleteSoloGameParams }>(
    "/game-sessions/solo/:id/result",
    {
      preHandler: authenticateRequest,
      schema: { params: completeSoloGameParamsSchema },
    },
    async (request, reply) => {
      const user = getAuthenticatedRequestUser(request);
      const result = await getSoloSavedResult(user.id, request.params.id);

      if (result === undefined) {
        return reply.code(404).send({ error: "Solo result not found" });
      }

      return result;
    },
  );

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

  server.get<{ Params: CompleteSoloGameParams }>(
    "/game-sessions/multiplayer/:id/result",
    {
      preHandler: authenticateRequest,
      schema: { params: completeSoloGameParamsSchema },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        return await multiplayerGameCoordinator.getResult(request.params.id, user.id);
      } catch (error: unknown) {
        if (error instanceof MultiplayerGameNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }
        if (error instanceof MultiplayerGameCompletionForbiddenError) {
          return reply.code(403).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.post<{
    Params: CompleteSoloGameParams;
    Body: CreateScoreInput;
  }>(
    "/game-sessions/multiplayer/:id/results",
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
        const completed = await multiplayerGameCoordinator.submitResult(user.id, {
          gameSessionId: request.params.id,
          ...request.body,
        });
        return reply.code(200).send(completed.resultState);
      } catch (error: unknown) {
        if (error instanceof MultiplayerGameNotFoundError) {
          return reply.code(404).send({ error: error.message });
        }
        if (error instanceof MultiplayerGameCompletionForbiddenError) {
          return reply.code(403).send({ error: error.message });
        }
        if (
          error instanceof MultiplayerGameNotPlayingError ||
          error instanceof MultiplayerResultConflictError
        ) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    },
  );
};
