export const ROOM_CAPACITY = 4;

export type RoomStatus = "waiting" | "playing";

export type RoomParticipant = {
  userId: string;
  joinedAt: string;
};

export type Room = {
  id: string;
  hostUserId: string;
  status: RoomStatus;
  participants: RoomParticipant[];
  createdAt: string;
};

export class RoomNotFoundError extends Error {
  constructor() {
    super("Room not found");
    this.name = "RoomNotFoundError";
  }
}

export class RoomFullError extends Error {
  constructor() {
    super("Room is full");
    this.name = "RoomFullError";
  }
}

export class RoomNotJoinableError extends Error {
  constructor() {
    super("Room is not waiting for players");
    this.name = "RoomNotJoinableError";
  }
}

export class UserAlreadyInRoomError extends Error {
  constructor() {
    super("User is already in another room");
    this.name = "UserAlreadyInRoomError";
  }
}

export class RoomParticipantNotFoundError extends Error {
  constructor() {
    super("You are not a participant in this room");
    this.name = "RoomParticipantNotFoundError";
  }
}
