import { buildApp } from "./app.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3001;

const getPort = (): number => {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535: ${process.env.PORT}`);
  }

  return port;
};

const start = async (): Promise<void> => {
  const host = process.env.HOST?.trim() || DEFAULT_HOST;
  const port = getPort();
  const app = await buildApp();
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise !== null) return shutdownPromise;

    shutdownPromise = (async () => {
      app.log.info({ signal }, "Shutting down Eut-zza API server");

      try {
        await app.close();
        app.log.info("Eut-zza API server shut down cleanly");
      } catch (error) {
        app.log.error(error, "Failed to shut down Eut-zza API server cleanly");
        process.exitCode = 1;
      }
    })();

    return shutdownPromise;
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  try {
    const address = await app.listen({
      host,
      port,
    });

    app.log.info(`Eut-zza Fastify API server: ${address}`);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
    await shutdown("startup-error");
  }
};

void start().catch((error: unknown) => {
  console.error("[HTTP] Failed to initialize Eut-zza API server", error);
  process.exitCode = 1;
});
