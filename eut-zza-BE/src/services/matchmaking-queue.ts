import {
  MATCHMAKING_MAX_PLAYERS,
  MATCHMAKING_MIN_PLAYERS,
  type MatchmakingCandidate,
  type StoredMatchmakingState,
} from "../domain/matchmaking.js";
import { getRedisClient } from "../redis.js";

const QUEUE_KEY = "eutzza:matchmaking:queue";
const PLAYER_KEY_PREFIX = "eutzza:matchmaking:player:";
const WAITING_TTL_SECONDS = 60;
const MATCHED_TTL_SECONDS = 5 * 60;
const CLAIM_TTL_SECONDS = 10;
const PARTIAL_MATCH_WAIT_MS = 10_000;

const playerKey = (userId: string) => `${PLAYER_KEY_PREFIX}${userId}`;

const parseStoredState = (value: string | null): StoredMatchmakingState | null => {
  if (value === null) return null;

  const parsed = JSON.parse(value) as Partial<StoredMatchmakingState>;
  if (
    (parsed.state === "waiting" || parsed.state === "claimed") &&
    typeof parsed.joinedAtMs === "number"
  ) {
    return { state: parsed.state, joinedAtMs: parsed.joinedAtMs };
  }
  if (parsed.state === "matched" && typeof parsed.roomId === "string") {
    return { state: "matched", roomId: parsed.roomId };
  }

  throw new Error("Invalid matchmaking state in Redis");
};

export interface MatchmakingQueue {
  getState(userId: string): Promise<StoredMatchmakingState | null>;
  enqueue(userId: string, nowMs: number): Promise<StoredMatchmakingState>;
  refreshWaiting(userId: string): Promise<void>;
  claimMatch(nowMs: number): Promise<MatchmakingCandidate[]>;
  markMatched(candidates: MatchmakingCandidate[], roomId: string): Promise<void>;
  restoreWaiting(candidates: MatchmakingCandidate[]): Promise<void>;
  cancel(userId: string): Promise<void>;
  getWaitingCount(): Promise<number>;
}

const enqueueScript = `
  local existing = redis.call('GET', KEYS[2])
  if existing then
    local parsedState = cjson.decode(existing)
    if parsedState.state == 'waiting' then
      redis.call('ZADD', KEYS[1], 'NX', parsedState.joinedAtMs, ARGV[1])
      redis.call('EXPIRE', KEYS[2], ARGV[3])
    end
    return existing
  end

  redis.call('ZADD', KEYS[1], 'NX', ARGV[2], ARGV[1])
  local state = cjson.encode({ state = 'waiting', joinedAtMs = tonumber(ARGV[2]) })
  redis.call('SET', KEYS[2], state, 'EX', ARGV[3])
  return state
`;

// 후보 조회, 만료 사용자 정리, 후보 제거와 임시 claim 표시를 한 Redis 명령으로 처리한다.
const claimMatchScript = `
  local entries = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
  local live = {}

  for index = 1, #entries, 2 do
    local userId = entries[index]
    local joinedAtMs = tonumber(entries[index + 1])
    local state = redis.call('GET', ARGV[6] .. userId)

    local parsedState = state and cjson.decode(state) or nil
    if parsedState and parsedState.state == 'waiting' then
      table.insert(live, { userId = userId, joinedAtMs = joinedAtMs })
      if #live == tonumber(ARGV[2]) then
        break
      end
    else
      redis.call('ZREM', KEYS[1], userId)
    end
  end

  if #live < tonumber(ARGV[1]) then
    return '[]'
  end

  if #live < tonumber(ARGV[2]) and tonumber(ARGV[3]) - live[1].joinedAtMs < tonumber(ARGV[4]) then
    return '[]'
  end

  for _, candidate in ipairs(live) do
    redis.call('ZREM', KEYS[1], candidate.userId)
    local state = cjson.encode({ state = 'claimed', joinedAtMs = candidate.joinedAtMs })
    redis.call('SET', ARGV[6] .. candidate.userId, state, 'EX', ARGV[5])
  end

  return cjson.encode(live)
`;

export class RedisMatchmakingQueue implements MatchmakingQueue {
  async getState(userId: string): Promise<StoredMatchmakingState | null> {
    const client = await getRedisClient();
    return parseStoredState(await client.get(playerKey(userId)));
  }

  async enqueue(userId: string, nowMs: number): Promise<StoredMatchmakingState> {
    const client = await getRedisClient();
    const result = await client.eval(enqueueScript, {
      keys: [QUEUE_KEY, playerKey(userId)],
      arguments: [userId, String(nowMs), String(WAITING_TTL_SECONDS)],
    });

    if (typeof result !== "string") {
      throw new Error("Redis returned an invalid matchmaking state");
    }
    const state = parseStoredState(result);
    if (state === null) throw new Error("Redis did not return matchmaking state");
    return state;
  }

  async refreshWaiting(userId: string): Promise<void> {
    const client = await getRedisClient();
    const state = await this.getState(userId);
    if (state?.state === "waiting") {
      await client.expire(playerKey(userId), WAITING_TTL_SECONDS);
    }
  }

  async claimMatch(nowMs: number): Promise<MatchmakingCandidate[]> {
    const client = await getRedisClient();
    const result = await client.eval(claimMatchScript, {
      keys: [QUEUE_KEY],
      arguments: [
        String(MATCHMAKING_MIN_PLAYERS),
        String(MATCHMAKING_MAX_PLAYERS),
        String(nowMs),
        String(PARTIAL_MATCH_WAIT_MS),
        String(CLAIM_TTL_SECONDS),
        PLAYER_KEY_PREFIX,
      ],
    });

    if (typeof result !== "string") {
      throw new Error("Redis returned invalid matchmaking candidates");
    }
    return JSON.parse(result) as MatchmakingCandidate[];
  }

  async markMatched(
    candidates: MatchmakingCandidate[],
    roomId: string,
  ): Promise<void> {
    if (candidates.length === 0) return;
    const client = await getRedisClient();
    const transaction = client.multi();
    const state = JSON.stringify({ state: "matched", roomId });

    for (const candidate of candidates) {
      transaction.set(playerKey(candidate.userId), state, {
        EX: MATCHED_TTL_SECONDS,
      });
    }
    await transaction.exec();
  }

  async restoreWaiting(candidates: MatchmakingCandidate[]): Promise<void> {
    if (candidates.length === 0) return;
    const client = await getRedisClient();
    const transaction = client.multi();

    for (const candidate of candidates) {
      transaction.zAdd(QUEUE_KEY, {
        score: candidate.joinedAtMs,
        value: candidate.userId,
      });
      transaction.set(
        playerKey(candidate.userId),
        JSON.stringify({
          state: "waiting",
          joinedAtMs: candidate.joinedAtMs,
        }),
        { EX: WAITING_TTL_SECONDS },
      );
    }
    await transaction.exec();
  }

  async cancel(userId: string): Promise<void> {
    const client = await getRedisClient();
    await client.multi()
      .zRem(QUEUE_KEY, userId)
      .del(playerKey(userId))
      .exec();
  }

  async getWaitingCount(): Promise<number> {
    const client = await getRedisClient();
    return client.zCard(QUEUE_KEY);
  }
}

export const matchmakingWaitingTtlMs = WAITING_TTL_SECONDS * 1_000;
