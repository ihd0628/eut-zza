import {
  MatchmakingUnavailableError,
  type MatchmakingCandidate,
  type MatchmakingStatus,
  type StoredMatchmakingState,
} from "../domain/matchmaking.js";
import type { RoomPresence } from "./room-presence.js";
import type { RoomStore } from "./room-service.js";
import {
  matchmakingWaitingTtlMs,
  type MatchmakingQueue,
} from "./matchmaking-queue.js";

type PresenceForMatchmaking = Pick<RoomPresence, "expectConnection">;

export class MatchmakingService {
  constructor(
    private readonly queue: MatchmakingQueue,
    private readonly roomStore: RoomStore,
    private readonly roomPresence: PresenceForMatchmaking,
  ) {}

  async join(userId: string): Promise<MatchmakingStatus> {
    try {
      const existingRoom = this.roomStore.findRoomByUserId(userId);
      if (existingRoom !== undefined) {
        await this.queue.cancel(userId);
        return { state: "matched", roomId: existingRoom.id };
      }

      const state = await this.queue.enqueue(userId, Date.now());
      if (state.state === "matched") return state;
      await this.tryCreateMatch();
      return this.getStatusInternal(userId);
    } catch (error: unknown) {
      throw this.toUnavailableError(error);
    }
  }

  async getStatus(userId: string): Promise<MatchmakingStatus> {
    try {
      return await this.getStatusInternal(userId);
    } catch (error: unknown) {
      throw this.toUnavailableError(error);
    }
  }

  async cancel(userId: string): Promise<MatchmakingStatus> {
    try {
      const room = this.roomStore.findRoomByUserId(userId);
      if (room !== undefined) return { state: "matched", roomId: room.id };

      await this.queue.cancel(userId);
      return { state: "idle" };
    } catch (error: unknown) {
      throw this.toUnavailableError(error);
    }
  }

  async cancelWaitingBestEffort(userId: string): Promise<void> {
    try {
      await this.queue.cancel(userId);
    } catch (error: unknown) {
      console.error("[Matchmaking] Failed to cancel stale waiting state", error);
    }
  }

  private async getStatusInternal(userId: string): Promise<MatchmakingStatus> {
    const room = this.roomStore.findRoomByUserId(userId);
    if (room !== undefined) {
      await this.queue.cancel(userId);
      return { state: "matched", roomId: room.id };
    }

    const state = await this.queue.getState(userId);
    if (state === null) return { state: "idle" };
    if (state.state === "matched") {
      // Room은 서버 RAM에 있으므로 재시작 뒤 남은 Redis 상태는 더 이상 유효하지 않다.
      await this.queue.cancel(userId);
      return { state: "idle" };
    }

    if (state.state === "waiting") await this.queue.refreshWaiting(userId);
    await this.tryCreateMatch();

    const matchedRoom = this.roomStore.findRoomByUserId(userId);
    if (matchedRoom !== undefined) {
      return { state: "matched", roomId: matchedRoom.id };
    }

    const latestState = await this.queue.getState(userId);
    if (latestState?.state === "matched") return latestState;
    const joinedAtMs = this.getJoinedAtMs(latestState ?? state);

    return {
      state: "waiting",
      joinedAtMs,
      expiresAtMs: Date.now() + matchmakingWaitingTtlMs,
      waitingPlayers: await this.queue.getWaitingCount(),
    };
  }

  private getJoinedAtMs(state: StoredMatchmakingState): number {
    return state.state === "matched" ? Date.now() : state.joinedAtMs;
  }

  private async tryCreateMatch(): Promise<void> {
    const candidates = await this.queue.claimMatch(Date.now());
    if (candidates.length === 0) return;

    const eligible = candidates.filter(
      (candidate) => this.roomStore.findRoomByUserId(candidate.userId) === undefined,
    );
    const ineligible = candidates.filter(
      (candidate) => !eligible.includes(candidate),
    );
    if (ineligible.length > 0) {
      await Promise.all(ineligible.map((candidate) => this.queue.cancel(candidate.userId)));
    }

    if (eligible.length < 2) {
      await this.queue.restoreWaiting(eligible);
      return;
    }

    try {
      const room = this.roomStore.createMatchedRoom(
        eligible.map((candidate) => candidate.userId),
      );
      for (const candidate of eligible) {
        this.roomPresence.expectConnection(room.id, candidate.userId);
      }
      await this.queue.markMatched(eligible, room.id);
    } catch (error: unknown) {
      await this.restoreBestEffort(eligible);
      throw error;
    }
  }

  private async restoreBestEffort(candidates: MatchmakingCandidate[]): Promise<void> {
    try {
      await this.queue.restoreWaiting(candidates);
    } catch (error: unknown) {
      console.error("[Matchmaking] Failed to restore claimed players", error);
    }
  }

  private toUnavailableError(error: unknown): Error {
    if (error instanceof MatchmakingUnavailableError) return error;
    console.error("[Matchmaking] Redis operation failed", error);
    return new MatchmakingUnavailableError();
  }
}
