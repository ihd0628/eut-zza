import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get("/health", () => {
    return {
      status: "ok",
      service: "eut-zza-be",
    };
  });
};
