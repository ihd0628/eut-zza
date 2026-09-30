import { requestJson } from "./http";

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
