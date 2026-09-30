import type { Difficulty } from "./song-api";
import { requestJson } from "./http";

export type UserScoreEntry = {
  scoreId: string;
  gameSessionId: string;
  songTitle: string;
  difficulty: Difficulty;
  score: number;
  maxCombo: number;
};

export type UserBestScoreEntry = {
  songId: string;
  songTitle: string;
  beatmapId: string;
  difficulty: Difficulty;
  bestScore: number;
  playCount: number;
};

type MyScoresResponse = {
  userId: string;
  scores: UserScoreEntry[];
};

type MyBestScoresResponse = {
  userId: string;
  bestScores: UserBestScoreEntry[];
};

export const getMyScores = async (): Promise<UserScoreEntry[]> => {
  const response = await requestJson<MyScoresResponse>("/users/me/scores");

  return response.scores;
};

export const getMyBestScores = async (): Promise<UserBestScoreEntry[]> => {
  const response = await requestJson<MyBestScoresResponse>(
    "/users/me/best-scores",
  );

  return response.bestScores;
};
