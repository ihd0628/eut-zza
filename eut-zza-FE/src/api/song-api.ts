import { requestJson } from "./http";

export type Difficulty = "easy" | "normal" | "hard";

export type BeatmapSummary = {
  id: string;
  difficulty: Difficulty;
  level: number;
  noteCount: number;
  durationMs: number;
};

export type Song = {
  id: string;
  title: string;
  audioUrl: string;
  beatmaps: BeatmapSummary[];
};

export type RankingEntry = {
  rank: number;
  userId: string;
  email: string;
  bestScore: number;
  playCount: number;
};

type SongsResponse = {
  songs: Song[];
};

export const getSongs = async (): Promise<Song[]> => {
  const response = await requestJson<SongsResponse>("/songs");

  return response.songs;
};

export const getSongRanking = async (
  songId: string,
  difficulty: Difficulty,
): Promise<RankingEntry[]> => {
  const query = new URLSearchParams({ difficulty });
  const response = await requestJson<{ ranking: RankingEntry[] }>(
    `/songs/${songId}/ranking?${query.toString()}`,
  );
  return response.ranking;
};
