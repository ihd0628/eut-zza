import type { Difficulty } from "../domain/beatmap.js";
import type { Song } from "../domain/song.js";
import type { RankingEntry } from "../domain/ranking.js";
import {
  findAllSongs,
  findSongById,
} from "../repositories/song-repository.js";
import type { LeaderboardService } from "./leaderboard-service.js";

// Service에서 발견한 애플리케이션 수준의 오류다.
// 이 오류를 HTTP 404로 바꾸는 일은 다음에 만들 Route가 담당한다.
export class SongNotFoundError extends Error {
  constructor(songId: string) {
    super(`Song ${songId} was not found`);
    this.name = "SongNotFoundError";
  }
}

// Service 함수 이름은 SQL 동작보다 사용자가 수행할 기능을 표현한다.
export const listSongs = async (): Promise<Song[]> => {
  return findAllSongs();
};

export const getSong = async (songId: string): Promise<Song> => {
  const song = await findSongById(songId);

  if (song === undefined) {
    throw new SongNotFoundError(songId);
  }

  return song;
};

export const getSongRanking = async (
  songId: string,
  difficulty: Difficulty,
  leaderboardService: LeaderboardService,
): Promise<RankingEntry[]> => {
  // 랭킹 결과가 비어 있는 것과 곡 자체가 없는 것은 서로 다른 상태다.
  // 먼저 곡의 존재를 확인해야 없는 곡에는 404를 반환할 수 있다.
  await getSong(songId);

  return leaderboardService.getRanking(songId, difficulty);
};
