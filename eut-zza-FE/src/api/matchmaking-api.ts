import { requestJson } from "./http";

export type MatchmakingStatus =
  | { state: "idle" }
  | {
      state: "waiting";
      joinedAtMs: number;
      expiresAtMs: number;
      waitingPlayers: number;
    }
  | { state: "matched"; roomId: string };

type MatchmakingResponse = {
  matchmaking: MatchmakingStatus;
};

export const joinMatchmaking = async (): Promise<MatchmakingStatus> =>
  (await requestJson<MatchmakingResponse>("/matchmaking/join", {
    method: "POST",
  })).matchmaking;

export const getMatchmakingStatus = async (): Promise<MatchmakingStatus> =>
  (await requestJson<MatchmakingResponse>("/matchmaking/status")).matchmaking;

export const cancelMatchmaking = async (): Promise<MatchmakingStatus> =>
  (await requestJson<MatchmakingResponse>("/matchmaking", {
    method: "DELETE",
  })).matchmaking;
