import {
  BeatmapNotFoundError,
  type CompleteSoloGameInput,
  type CompletedSoloGame,
  type StartedSoloGame,
  type SoloSavedResult,
} from "../domain/game-session.js";
import type { Room } from "../domain/room.js";
import {
  createMultiplayerGame,
  createSoloGame,
} from "../repositories/game-session-repository.js";
import { findBeatmapDurationMs } from "../repositories/beatmap-repository.js";
import { completeSoloGameWithScore, findSoloSavedResult } from "../repositories/score-repository.js";
import type { RoomStore } from "./room-service.js";

export const MULTIPLAYER_START_DELAY_MS = 5_000;
export const MULTIPLAYER_RESULT_GRACE_MS = 10_000;

// Service는 "인증된 사용자가 특정 채보로 솔로 게임을 시작한다"는
// 애플리케이션 기능을 표현한다.
export const startSoloGame = async (
  userId: string,
  beatmapId: string,
): Promise<StartedSoloGame> => {
  return createSoloGame(userId, beatmapId);
};

export const startMultiplayerGame = async (
  roomStore: RoomStore,
  roomId: string,
  hostUserId: string,
): Promise<Room> => {
  const room = roomStore.beginStart(roomId, hostUserId);

  try {
    if (room.selectedBeatmapId === null) {
      throw new Error("A starting room must have a selected beatmap");
    }

    const durationMs = await findBeatmapDurationMs(room.selectedBeatmapId);
    if (durationMs === undefined) throw new BeatmapNotFoundError();

    // DB 생성과 WebSocket broadcast가 끝난 뒤에도 각 브라우저가 예약할 여유를 둔다.
    const startAtServerMs = Date.now() + MULTIPLAYER_START_DELAY_MS;
    const resultDeadlineAtServerMs =
      startAtServerMs + durationMs + MULTIPLAYER_RESULT_GRACE_MS;
    const startedGame = await createMultiplayerGame(
      room.participants.map((participant) => participant.userId),
      room.selectedBeatmapId,
      startAtServerMs,
    );

    return roomStore.completeStart(roomId, {
      gameSessionId: startedGame.gameSession.id,
      beatmapId: startedGame.gameSession.beatmapId,
      startAtServerMs,
      resultDeadlineAtServerMs,
      players: startedGame.gamePlayers.map((player) => ({
        userId: player.userId,
        gamePlayerId: player.id,
        score: 0,
        combo: 0,
        resultStatus: "playing",
      })),
      results: null,
    });
  } catch (error: unknown) {
    roomStore.cancelStart(roomId);
    throw error;
  }
};

// 솔로 경기만의 종료 규칙을 표현한다.
// 멀티플레이에서는 참가자 한 명의 결과 제출만으로 경기를 완료하지 않는다.
export const completeSoloGame = async (
  authenticatedUserId: string,
  input: CompleteSoloGameInput,
): Promise<CompletedSoloGame> => {
  return completeSoloGameWithScore(authenticatedUserId, input);
};

export const getSoloSavedResult = async (
  userId: string,
  gameSessionId: string,
): Promise<SoloSavedResult | undefined> => {
  return findSoloSavedResult(userId, gameSessionId);
};
