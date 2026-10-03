import type { CreateScoreInput, Score } from "./score.js";
import type { Difficulty } from "./beatmap.js";

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

export type CompleteSoloGameInput = CreateScoreInput & {
  gameSessionId: string;
};

export type CompletedSoloGame = {
  gameSession: GameSession;
  score: Score;
};

export type SoloSavedResult = {
  gameSessionId: string;
  songTitle: string;
  difficulty: Difficulty;
  score: Score;
};

export class BeatmapNotFoundError extends Error {
  constructor() {
    super("Beatmap not found");
    this.name = "BeatmapNotFoundError";
  }
}

export class SoloGameNotFoundError extends Error {
  constructor() {
    super("Solo game not found");
    this.name = "SoloGameNotFoundError";
  }
}

export class SoloGameCompletionForbiddenError extends Error {
  constructor() {
    super("You cannot complete this solo game");
    this.name = "SoloGameCompletionForbiddenError";
  }
}

export class SoloGameNotPlayingError extends Error {
  constructor() {
    super("Solo game is not playing");
    this.name = "SoloGameNotPlayingError";
  }
}
