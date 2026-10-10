import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const createRedisClient = () => {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      // Redis가 없어도 PostgreSQL 기반 기능은 시작할 수 있도록 빠르게 실패한다.
      connectTimeout: 1_000,
      reconnectStrategy: false,
    },
  });

  // node-redis는 error listener가 없으면 EventEmitter 오류로 프로세스가 종료될 수 있다.
  client.on("error", (error: Error) => {
    console.error("[Redis] client error", error.message);
  });

  return client;
};

export type AppRedisClient = ReturnType<typeof createRedisClient>;

let redisClient: AppRedisClient | null = null;
let connectionPromise: Promise<AppRedisClient> | null = null;

/**
 * 프로세스 안에서 Redis 연결 하나를 재사용한다.
 * 최초 연결 실패 후에도 다음 요청에서 다시 연결을 시도할 수 있다.
 */
export const getRedisClient = async (): Promise<AppRedisClient> => {
  if (redisClient?.isReady) return redisClient;
  if (connectionPromise !== null) return connectionPromise;

  const client = createRedisClient();
  redisClient = client;
  connectionPromise = client.connect()
    .then(() => client)
    .catch((error: unknown) => {
      if (redisClient === client) redisClient = null;
      if (client.isOpen) client.destroy();
      throw error;
    })
    .finally(() => {
      connectionPromise = null;
    });

  return connectionPromise;
};

export const closeRedis = async (): Promise<void> => {
  const client = redisClient;
  redisClient = null;
  connectionPromise = null;

  if (client === null || !client.isOpen) return;
  await client.close();
};
