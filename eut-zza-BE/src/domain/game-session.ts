export type GameMode = "solo" | "multiplayer";

export type GameSessionStatus =
  | "waiting"
  | "playing"
  | "completed"
  | "cancelled";

export type GameSession = {
  id: string;
  beatmapId: string;
  mode: GameMode;
  status: GameSessionStatus;
};

export type GamePlayer = {
  id: string;
  gameSessionId: string;
  userId: string;
};

export type StartedSoloGame = {
  gameSession: GameSession;
  gamePlayer: GamePlayer;
};

export class BeatmapNotFoundError extends Error {
  constructor() {
    super("Beatmap not found");
    this.name = "BeatmapNotFoundError";
  }
}
