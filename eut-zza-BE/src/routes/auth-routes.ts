import type { FastifyPluginAsync } from "fastify";

type CredentialsRequestBody = {
  email: string;
  password: string;
};

const credentialsBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: {
      type: "string",
      minLength: 1,
    },
    password: {
      type: "string",
      minLength: 1,
    },
  },
} as const;

// 실제 인증을 구현하기 전까지 기존 API 동작을 유지하기 위한 임시 사용자다.
const DEMO_USER = {
  id: "user-1",
  email: "test@example.com",
  password: "1234",
};

export const authRoutes: FastifyPluginAsync = async (server) => {
  server.post<{ Body: CredentialsRequestBody }>(
    "/auth/signup",
    {
      schema: {
        body: credentialsBodySchema,
      },
    },
    (request, reply) => {
      return reply.code(201).send({
        user: {
          id: "user-1",
          email: request.body.email,
        },
      });
    },
  );

  server.post<{ Body: CredentialsRequestBody }>(
    "/auth/login",
    {
      schema: {
        body: credentialsBodySchema,
      },
    },
    (request, reply) => {
      const credentialsMatch =
        request.body.email === DEMO_USER.email &&
        request.body.password === DEMO_USER.password;

      if (!credentialsMatch) {
        return reply.code(401).send({
          error: "Invalid email or password",
        });
      }

      return {
        user: {
          id: DEMO_USER.id,
          email: DEMO_USER.email,
        },
      };
    },
  );
};
