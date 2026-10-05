import { requestJson } from "./http";

export type RoomParticipant = {
  userId: string;
  joinedAt: string;
  isReady: boolean;
  preparedBeatmapId: string | null;
};
export type MultiplayerResultStatus =
  | "playing"
  | "submitted"
  | "disconnected"
  | "timed_out";
export type RoomGamePlayer = {
  userId: string;
  gamePlayerId: string;
  score: number;
  combo: number;
  resultStatus: MultiplayerResultStatus;
};
export type MultiplayerResultEntry = {
  userId: string;
  email: string;
  gamePlayerId: string;
  resultStatus: MultiplayerResultStatus;
  score: number | null;
  perfectCount: number | null;
  greatCount: number | null;
  goodCount: number | null;
  missCount: number | null;
  maxCombo: number | null;
  rank: number | null;
  isWinner: boolean;
};
export type RoomGame = {
  gameSessionId: string;
  beatmapId: string;
  startAtServerMs: number;
  resultDeadlineAtServerMs: number;
  players: RoomGamePlayer[];
  results: MultiplayerResultEntry[] | null;
};
export type Room = {
  id: string;
  hostUserId: string;
  status: "waiting" | "starting" | "playing" | "finished";
  selectedBeatmapId: string | null;
  lastCompletedGameSessionId: string | null;
  participants: RoomParticipant[];
  currentGame: RoomGame | null;
  createdAt: string;
};

export const getRooms = async (): Promise<Room[]> =>
  (await requestJson<{ rooms: Room[] }>("/rooms")).rooms;

export const getRoom = async (roomId: string): Promise<Room> =>
  (await requestJson<{ room: Room }>(`/rooms/${roomId}`)).room;

export const createRoom = async (): Promise<Room> =>
  (await requestJson<{ room: Room }>("/rooms", { method: "POST" })).room;

export const joinRoom = async (roomId: string): Promise<Room> =>
  (await requestJson<{ room: Room }>(`/rooms/${roomId}/join`, { method: "POST" })).room;

export const leaveRoom = async (roomId: string): Promise<Room | null> =>
  (await requestJson<{ room: Room | null }>(`/rooms/${roomId}/leave`, { method: "POST" })).room;

export const returnRoomToLobby = async (
  roomId: string,
  gameSessionId: string,
): Promise<Room> =>
  (await requestJson<{ room: Room }>(`/rooms/${roomId}/lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameSessionId }),
  })).room;

export const selectRoomBeatmap = async (roomId: string, beatmapId: string): Promise<Room> =>
  (await requestJson<{ room: Room }>(`/rooms/${roomId}/selection`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beatmapId }),
  })).room;

export const setRoomReady = async (
  roomId: string,
  beatmapId: string,
  ready: boolean,
): Promise<Room> =>
  (await requestJson<{ room: Room }>(`/rooms/${roomId}/ready`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beatmapId, ready }),
  })).room;

export const markRoomAudioPrepared = async (
  roomId: string,
  beatmapId: string,
): Promise<Room> =>
  (await requestJson<{ room: Room }>(`/rooms/${roomId}/audio-prepared`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beatmapId }),
  })).room;

export const startRoomGame = async (roomId: string): Promise<Room> =>
  (await requestJson<{ room: Room }>(`/rooms/${roomId}/start`, {
    method: "POST",
  })).room;
