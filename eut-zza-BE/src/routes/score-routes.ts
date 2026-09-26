import type { FastifyPluginAsync } from "fastify";
import {
  GamePlayerNotFoundError,
  ScoreAlreadyExistsError,
  type CreateScoreInput,
} from "../domain/score.js";
import { submitScore } from "../services/score-service.js";

const nonNegativeIntegerSchema = {
  type: "integer",
  minimum: 0,
  maximum: 2_147_483_647,
} as const;

const createScoreBodySchema = {
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

export const scoreRoutes: FastifyPluginAsync = async (server) => {
  server.post<{ Body: CreateScoreInput }>(
    "/scores",
    {
      schema: {
        body: createScoreBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const score = await submitScore(request.body);

        return reply.code(201).send({
          score,
        });
      } catch (error: unknown) {
        if (error instanceof ScoreAlreadyExistsError) {
          return reply.code(409).send({
            error: error.message,
          });
        }

        if (error instanceof GamePlayerNotFoundError) {
          return reply.code(404).send({
            error: error.message,
          });
        }

        throw error;
      }
    },
  );
};
