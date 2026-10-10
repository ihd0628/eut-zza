export const MATCHMAKING_MIN_PLAYERS = 2;
export const MATCHMAKING_MAX_PLAYERS = 4;

export type MatchmakingStatus =
  | { state: "idle" }
  | {
      state: "waiting";
      joinedAtMs: number;
      expiresAtMs: number;
      waitingPlayers: number;
    }
  | { state: "matched"; roomId: string };

export type StoredMatchmakingState =
  | { state: "waiting"; joinedAtMs: number }
  | { state: "claimed"; joinedAtMs: number }
  | { state: "matched"; roomId: string };

export type MatchmakingCandidate = {
  userId: string;
  joinedAtMs: number;
};

export class MatchmakingUnavailableError extends Error {
  constructor() {
    super("Matchmaking is temporarily unavailable");
    this.name = "MatchmakingUnavailableError";
  }
}
