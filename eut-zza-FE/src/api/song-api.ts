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

type SongsResponse = {
  songs: Song[];
};

export const getSongs = async (): Promise<Song[]> => {
  const response = await requestJson<SongsResponse>("/songs");

  return response.songs;
};
