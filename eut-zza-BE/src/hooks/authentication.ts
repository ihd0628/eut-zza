import type {
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import { SESSION_COOKIE_NAME } from "../domain/session.js";
import type { User } from "../domain/user.js";
import {
  AuthenticationRequiredError,
  getCurrentUser,
} from "../services/auth-service.js";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUser: User | null;
  }
}

export const authenticateRequest: preHandlerHookHandler = async (
  request,
  reply,
) => {
  try {
    request.authenticatedUser = await getCurrentUser(
      request.cookies[SESSION_COOKIE_NAME],
    );
  } catch (error: unknown) {
    if (error instanceof AuthenticationRequiredError) {
      return reply.code(401).send({
        error: error.message,
      });
    }

    throw error;
  }
};

export const getAuthenticatedRequestUser = (
  request: FastifyRequest,
): User => {
  if (request.authenticatedUser === null) {
    // preHandler가 설정하지 못한 상태에서 handler가 실행되면 서버 구성 오류다.
    throw new Error(
      `Authenticated user is missing after preHandler for ${request.method} ${request.url}`,
    );
  }

  return request.authenticatedUser;
};
