export const currentUserQueryKey = ["auth", "me"] as const;

export const songsQueryKey = ["songs"] as const;
export const songRankingQueryKey = (songId: string, difficulty: string) =>
  [...songsQueryKey, songId, "ranking", difficulty] as const;

export const roomsQueryKey = ["rooms"] as const;
export const matchmakingQueryKey = ["matchmaking"] as const;
export const roomQueryKey = (roomId: string) => [...roomsQueryKey, roomId] as const;
export const soloResultQueryKey = (gameSessionId: string) => ["solo-result", gameSessionId] as const;
export const multiplayerResultQueryKey = (gameSessionId: string) =>
  ["multiplayer-result", gameSessionId] as const;

export const myRecordsQueryKey = ["users", "me"] as const;

export const myScoresQueryKey = [...myRecordsQueryKey, "scores"] as const;

export const myBestScoresQueryKey = [
  ...myRecordsQueryKey,
  "best-scores",
] as const;
