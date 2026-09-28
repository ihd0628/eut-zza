import type { FastifyPluginAsync } from "fastify";
import { EmailAlreadyInUseError } from "../domain/user.js";
import {
  AuthenticationRequiredError,
  getCurrentUser,
  InvalidCredentialsError,
  login,
  logout,
  signUp,
} from "../services/auth-service.js";

type CredentialsRequestBody = {
  email: string;
  password: string;
};

const SESSION_COOKIE_NAME = "eut_zza_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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

export const authRoutes: FastifyPluginAsync = async (server) => {
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

  server.get("/auth/me", async (request, reply) => {
    try {
      const user = await getCurrentUser(
        request.cookies[SESSION_COOKIE_NAME],
      );

      return {
        user,
      };
    } catch (error: unknown) {
      if (error instanceof AuthenticationRequiredError) {
        return reply.code(401).send({
          error: error.message,
        });
      }

      throw error;
    }
  });

  server.post("/auth/logout", async (request, reply) => {
    await logout(request.cookies[SESSION_COOKIE_NAME]);

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
