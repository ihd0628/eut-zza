export const ROOM_CAPACITY = 4;

export type RoomStatus = "waiting" | "starting" | "playing";

export type RoomParticipant = {
  userId: string;
  joinedAt: string;
  isReady: boolean;
  preparedBeatmapId: string | null;
};

export type RoomGamePlayer = {
  userId: string;
  gamePlayerId: string;
};

export type RoomGame = {
  gameSessionId: string;
  beatmapId: string;
  startAtServerMs: number;
  players: RoomGamePlayer[];
};

export type Room = {
  id: string;
  hostUserId: string;
  status: RoomStatus;
  selectedBeatmapId: string | null;
  participants: RoomParticipant[];
  currentGame: RoomGame | null;
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

export class RoomHostRequiredError extends Error {
  constructor() {
    super("Only the room host can select a beatmap");
    this.name = "RoomHostRequiredError";
  }
}

export class RoomSelectionLockedError extends Error {
  constructor() {
    super("All participants are ready; the beatmap cannot be changed");
    this.name = "RoomSelectionLockedError";
  }
}

export class RoomBeatmapNotSelectedError extends Error {
  constructor() {
    super("Select a beatmap before getting ready");
    this.name = "RoomBeatmapNotSelectedError";
  }
}

export class RoomBeatmapChangedError extends Error {
  constructor() {
    super("The room beatmap has changed; check the current selection");
    this.name = "RoomBeatmapChangedError";
  }
}

export class RoomNotWaitingError extends Error {
  constructor() {
    super("Room is not waiting for players");
    this.name = "RoomNotWaitingError";
  }
}

export class RoomNotEnoughParticipantsError extends Error {
  constructor() {
    super("At least two participants are required to start");
    this.name = "RoomNotEnoughParticipantsError";
  }
}

export class RoomParticipantsNotReadyError extends Error {
  constructor() {
    super("All participants must be ready");
    this.name = "RoomParticipantsNotReadyError";
  }
}

export class RoomAudioNotPreparedError extends Error {
  constructor() {
    super("All participants must prepare the selected audio");
    this.name = "RoomAudioNotPreparedError";
  }
}
