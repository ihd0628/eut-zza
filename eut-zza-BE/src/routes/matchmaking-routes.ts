import type { FastifyPluginAsync } from "fastify";
import { MatchmakingUnavailableError } from "../domain/matchmaking.js";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../hooks/authentication.js";
import type { MatchmakingService } from "../services/matchmaking-service.js";

type MatchmakingRoutesOptions = {
  matchmakingService: MatchmakingService;
};

export const matchmakingRoutes: FastifyPluginAsync<MatchmakingRoutesOptions> = async (
  server,
  { matchmakingService },
) => {
  server.post(
    "/matchmaking/join",
    { preHandler: authenticateRequest },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        return { matchmaking: await matchmakingService.join(user.id) };
      } catch (error: unknown) {
        if (error instanceof MatchmakingUnavailableError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.get(
    "/matchmaking/status",
    { preHandler: authenticateRequest },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        return { matchmaking: await matchmakingService.getStatus(user.id) };
      } catch (error: unknown) {
        if (error instanceof MatchmakingUnavailableError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.delete(
    "/matchmaking",
    { preHandler: authenticateRequest },
    async (request, reply) => {
      try {
        const user = getAuthenticatedRequestUser(request);
        return { matchmaking: await matchmakingService.cancel(user.id) };
      } catch (error: unknown) {
        if (error instanceof MatchmakingUnavailableError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    },
  );
};
