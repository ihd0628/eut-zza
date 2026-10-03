import { requestJson } from "./http";

export type RoomParticipant = { userId: string; joinedAt: string };
export type Room = {
  id: string;
  hostUserId: string;
  status: "waiting" | "playing";
  participants: RoomParticipant[];
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
