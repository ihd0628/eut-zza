import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  MatchmakingCandidate,
  StoredMatchmakingState,
} from "../src/domain/matchmaking.js";
import type { MatchmakingQueue } from "../src/services/matchmaking-queue.js";
import { MatchmakingService } from "../src/services/matchmaking-service.js";
import { RoomStore } from "../src/services/room-service.js";

class FakeMatchmakingQueue implements MatchmakingQueue {
  readonly states = new Map<string, StoredMatchmakingState>();

  constructor(private readonly matchSize: number) {}

  async getState(userId: string) { return this.states.get(userId) ?? null; }
  async enqueue(userId: string, nowMs: number) {
    const existing = this.states.get(userId);
    if (existing !== undefined) return existing;
    const state = { state: "waiting", joinedAtMs: nowMs } as const;
    this.states.set(userId, state);
    return state;
  }
  async refreshWaiting() {}
  async claimMatch(): Promise<MatchmakingCandidate[]> {
    const waiting = Array.from(this.states.entries())
      .filter((entry): entry is [string, Extract<StoredMatchmakingState, { state: "waiting" }>] =>
        entry[1].state === "waiting")
      .slice(0, this.matchSize);
    if (waiting.length < this.matchSize) return [];
    for (const [userId, state] of waiting) {
      this.states.set(userId, { state: "claimed", joinedAtMs: state.joinedAtMs });
    }
    return waiting.map(([userId, state]) => ({ userId, joinedAtMs: state.joinedAtMs }));
  }
  async markMatched(candidates: MatchmakingCandidate[], roomId: string) {
    for (const candidate of candidates) {
      this.states.set(candidate.userId, { state: "matched", roomId });
    }
  }
  async restoreWaiting(candidates: MatchmakingCandidate[]) {
    for (const candidate of candidates) {
      this.states.set(candidate.userId, {
        state: "waiting",
        joinedAtMs: candidate.joinedAtMs,
      });
    }
  }
  async cancel(userId: string) { this.states.delete(userId); }
  async getWaitingCount() {
    return Array.from(this.states.values()).filter(({ state }) => state === "waiting").length;
  }
}

class FakePresence {
  readonly expected: Array<{ roomId: string; userId: string }> = [];
  expectConnection(roomId: string, userId: string) {
    this.expected.push({ roomId, userId });
  }
}

for (const playerCount of [2, 3, 4]) {
  test(`자동 매칭된 ${playerCount}명이 하나의 방에 한 번씩 들어간다`, async () => {
    const queue = new FakeMatchmakingQueue(playerCount);
    const roomStore = new RoomStore();
    const presence = new FakePresence();
    const service = new MatchmakingService(queue, roomStore, presence);

    for (let index = 1; index <= playerCount; index += 1) {
      await service.join(String(index));
    }

    const rooms = roomStore.listRooms();
    assert.equal(rooms.length, 1);
    assert.deepEqual(
      rooms[0]?.participants.map(({ userId }) => userId),
      Array.from({ length: playerCount }, (_, index) => String(index + 1)),
    );
    assert.equal(presence.expected.length, playerCount);
    for (let index = 1; index <= playerCount; index += 1) {
      assert.deepEqual(await service.getStatus(String(index)), {
        state: "matched",
        roomId: rooms[0]?.id,
      });
    }
  });
}

test("같은 사용자가 참가를 재시도해도 대기 상태를 중복 생성하지 않는다", async () => {
  const queue = new FakeMatchmakingQueue(4);
  const service = new MatchmakingService(queue, new RoomStore(), new FakePresence());

  await service.join("1");
  const firstState = queue.states.get("1");
  await service.join("1");

  assert.equal(queue.states.size, 1);
  assert.deepEqual(queue.states.get("1"), firstState);
});

test("매칭 전 취소하면 사용자 상태가 idle로 돌아간다", async () => {
  const queue = new FakeMatchmakingQueue(4);
  const service = new MatchmakingService(queue, new RoomStore(), new FakePresence());

  await service.join("1");

  assert.deepEqual(await service.cancel("1"), { state: "idle" });
  assert.deepEqual(await service.getStatus("1"), { state: "idle" });
});
