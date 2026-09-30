import { requestJson } from "./http";
import type { GameResult } from "../game/types";

export type GameMode = "solo" | "multiplayer";

export type GameSessionStatus =
  | "waiting"
  | "playing"
  | "completed"
  | "cancelled";

export type StartedSoloGame = {
  gameSession: {
    id: string;
    beatmapId: string;
    mode: GameMode;
    status: GameSessionStatus;
  };
  gamePlayer: {
    id: string;
    gameSessionId: string;
    userId: string;
  };
};

export type CompletedSoloGame = {
  gameSession: StartedSoloGame["gameSession"];
  score: GameResult & {
    id: string;
    gamePlayerId: string;
  };
};

export type CompleteSoloGameInput = GameResult & {
  gamePlayerId: string;
};

export const startSoloGame = async (
  beatmapId: string,
): Promise<StartedSoloGame> => {
  return requestJson<StartedSoloGame>("/game-sessions/solo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ beatmapId }),
  });
};

export const completeSoloGame = async (
  gameSessionId: string,
  input: CompleteSoloGameInput,
): Promise<CompletedSoloGame> => {
  return requestJson<CompletedSoloGame>(
    `/game-sessions/solo/${gameSessionId}/complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
};
