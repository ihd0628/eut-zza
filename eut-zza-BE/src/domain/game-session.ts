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
  resultStatus: MultiplayerResultStatus;
};

export type MultiplayerResultStatus =
  | "playing"
  | "submitted"
  | "disconnected"
  | "timed_out";

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

export type MultiplayerResultState = {
  gameSessionId: string;
  status: GameSessionStatus;
  players: MultiplayerResultEntry[];
};

export type StartedSoloGame = {
  gameSession: GameSession;
  gamePlayer: GamePlayer;
};

export type StartedMultiplayerGame = {
  gameSession: GameSession;
  gamePlayers: GamePlayer[];
  startAtServerMs: number;
};

export type CompleteMultiplayerGameInput = CreateScoreInput & {
  gameSessionId: string;
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

export class MultiplayerGameNotFoundError extends Error {
  constructor() {
    super("Multiplayer game not found");
    this.name = "MultiplayerGameNotFoundError";
  }
}

export class MultiplayerGameCompletionForbiddenError extends Error {
  constructor() {
    super("You cannot submit a result for this multiplayer game");
    this.name = "MultiplayerGameCompletionForbiddenError";
  }
}

export class MultiplayerGameNotPlayingError extends Error {
  constructor() {
    super("Multiplayer game is not accepting results");
    this.name = "MultiplayerGameNotPlayingError";
  }
}

export class MultiplayerResultConflictError extends Error {
  constructor() {
    super("A different result was already submitted for this player");
    this.name = "MultiplayerResultConflictError";
  }
}
