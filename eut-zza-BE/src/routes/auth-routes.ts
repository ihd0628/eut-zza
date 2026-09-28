import type { FastifyPluginAsync } from "fastify";
import { EmailAlreadyInUseError } from "../domain/user.js";
import {
  InvalidCredentialsError,
  login,
  signUp,
} from "../services/auth-service.js";

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
        const user = await login(request.body);

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
};
