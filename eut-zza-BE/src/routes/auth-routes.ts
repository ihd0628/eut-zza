import type { FastifyPluginAsync } from "fastify";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "../domain/session.js";
import { EmailAlreadyInUseError } from "../domain/user.js";
import {
  authenticateRequest,
  getAuthenticatedRequestUser,
} from "../hooks/authentication.js";
import {
  InvalidCredentialsError,
  AuthenticationRequiredError,
  getCurrentUser,
  login,
  logout,
  signUp,
} from "../services/auth-service.js";
import type { RoomPresence } from "../services/room-presence.js";

type AuthRoutesOptions = {
  roomPresence: RoomPresence;
};

type CredentialsRequestBody = {
  email: string;
  password: string;
};

const loginBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: {
      type: "string",
      format: "email",
      minLength: 1,
      maxLength: 254,
    },
    password: {
      type: "string",
      minLength: 1,
      maxLength: 128,
    },
  },
} as const;

const signUpBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: {
      type: "string",
      format: "email",
      minLength: 1,
      maxLength: 254,
    },
    password: {
      type: "string",
      minLength: 8,
      maxLength: 128,
    },
  },
} as const;

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  server,
  { roomPresence },
) => {
  server.post<{ Body: CredentialsRequestBody }>(
    "/auth/signup",
    {
      schema: {
        body: signUpBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const user = await signUp(request.body);

        return reply.code(201).send({
          user,
        });
      } catch (error: unknown) {
        if (error instanceof EmailAlreadyInUseError) {
          return reply.code(409).send({
            error: error.message,
          });
        }

        throw error;
      }
    },
  );

  server.post<{ Body: CredentialsRequestBody }>(
    "/auth/login",
    {
      schema: {
        body: loginBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const { user, sessionToken, expiresAt } = await login(request.body);

        reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: SESSION_MAX_AGE_SECONDS,
          expires: expiresAt,
        });

        return {
          user,
        };
      } catch (error: unknown) {
        if (error instanceof InvalidCredentialsError) {
          return reply.code(401).send({
            error: error.message,
          });
        }

        throw error;
      }
    },
  );

  server.get(
    "/auth/me",
    {
      preHandler: authenticateRequest,
    },
    async (request) => {
      return {
        user: getAuthenticatedRequestUser(request),
      };
    },
  );

  server.post("/auth/logout", async (request, reply) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];

    if (sessionToken !== undefined) {
      try {
        const user = await getCurrentUser(sessionToken);
        roomPresence.leaveUser(user.id);
      } catch (error: unknown) {
        if (!(error instanceof AuthenticationRequiredError)) {
          throw error;
        }
      }
    }

    await logout(sessionToken);

    // 생성할 때와 같은 Path를 지정해야 브라우저가 기존 Cookie를 제거한다.
    reply.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return reply.code(204).send();
  });
};
