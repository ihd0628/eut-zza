import type { FastifyPluginAsync } from "fastify";
import { UserNotFoundError } from "../domain/user.js";
import { getUserScores } from "../services/user-service.js";

type UserParams = {
  id: string;
};

const userParamsSchema = {
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

export const userRoutes: FastifyPluginAsync = async (server) => {
  server.get<{ Params: UserParams }>(
    "/users/:id/scores",
    {
      schema: {
        params: userParamsSchema,
      },
    },
    async (request, reply) => {
      try {
        const scores = await getUserScores(request.params.id);

        return {
          userId: request.params.id,
          scores,
        };
      } catch (error: unknown) {
        if (error instanceof UserNotFoundError) {
          return reply.code(404).send({
            error: "User Not Found",
          });
        }

        throw error;
      }
    },
  );
};
