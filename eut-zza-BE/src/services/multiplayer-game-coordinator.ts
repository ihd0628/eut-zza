import {
  MultiplayerGameNotFoundError,
  type CompleteMultiplayerGameInput,
} from "../domain/game-session.js";
import {
  expireMultiplayerGame,
  findMultiplayerResultState,
  markMultiplayerPlayerUnavailable,
  submitMultiplayerResult,
} from "../repositories/multiplayer-game-repository.js";
import { startMultiplayerGame } from "./game-session-service.js";
import type { RoomPresence } from "./room-presence.js";
import type { RoomStore } from "./room-service.js";

export class MultiplayerGameCoordinator {
  private readonly deadlineTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly roomStore: RoomStore,
    private readonly roomPresence: RoomPresence,
  ) {}

  async startGame(roomId: string, hostUserId: string) {
    const room = await startMultiplayerGame(this.roomStore, roomId, hostUserId);
    const game = room.currentGame;
    if (game === null) throw new Error("Started room has no current game");

    this.scheduleDeadline(roomId, game.gameSessionId, game.resultDeadlineAtServerMs);
    return room;
  }

  updateProgress(
    roomId: string,
    userId: string,
    gameSessionId: string,
    score: number,
    combo: number,
  ): void {
    const room = this.roomStore.updateGameProgress(
      roomId,
      userId,
      gameSessionId,
      score,
      combo,
    );
    const player = room.currentGame?.players.find((entry) => entry.userId === userId);
    if (player !== undefined) {
      this.roomPresence.broadcastGameProgress(roomId, gameSessionId, player);
    }
  }

  async submitResult(
    userId: string,
    input: CompleteMultiplayerGameInput,
  ) {
    const currentRoom = this.roomStore.findRoomByGameSessionId(input.gameSessionId);
    if (currentRoom === undefined) {
      throw new MultiplayerGameNotFoundError();
    }
    const roomId = currentRoom.id;
    const state = await submitMultiplayerResult(userId, input);
    const room = this.roomStore.applyMultiplayerResultState(roomId, state);
    this.finishIfCompleted(state.gameSessionId, state.status);
    this.roomPresence.broadcastRoom(roomId);
    return { room, resultState: state };
  }

  async markDisconnected(roomId: string, userId: string): Promise<void> {
    const room = this.roomStore.getRoom(roomId);
    const game = room?.currentGame;
    if (room?.status !== "playing" || game === null || game === undefined) return;

    const state = await markMultiplayerPlayerUnavailable(
      game.gameSessionId,
      userId,
      "disconnected",
    );
    this.roomStore.applyMultiplayerResultState(roomId, state);
    this.finishIfCompleted(state.gameSessionId, state.status);
    this.roomPresence.broadcastRoom(roomId);
  }

  async getResult(gameSessionId: string, userId: string) {
    return findMultiplayerResultState(gameSessionId, userId);
  }

  private scheduleDeadline(
    roomId: string,
    gameSessionId: string,
    deadlineAtServerMs: number,
  ): void {
    const timer = setTimeout(() => {
      this.deadlineTimers.delete(gameSessionId);
      void this.expireGame(roomId, gameSessionId);
    }, Math.max(0, deadlineAtServerMs - Date.now()));
    timer.unref();
    this.deadlineTimers.set(gameSessionId, timer);
  }

  private async expireGame(roomId: string, gameSessionId: string): Promise<void> {
    try {
      const state = await expireMultiplayerGame(gameSessionId);
      if (this.roomStore.getRoom(roomId) !== undefined) {
        this.roomStore.applyMultiplayerResultState(roomId, state);
        this.roomPresence.broadcastRoom(roomId);
      }
    } catch (error: unknown) {
      console.error("[MultiplayerGame] Failed to expire game", error);
    }
  }

  private finishIfCompleted(
    gameSessionId: string,
    status: string,
  ): void {
    if (status !== "completed") return;
    const timer = this.deadlineTimers.get(gameSessionId);
    if (timer !== undefined) clearTimeout(timer);
    this.deadlineTimers.delete(gameSessionId);
  }

  dispose(): void {
    for (const timer of this.deadlineTimers.values()) clearTimeout(timer);
    this.deadlineTimers.clear();
  }
}
