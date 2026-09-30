export const currentUserQueryKey = ["auth", "me"] as const;

export const songsQueryKey = ["songs"] as const;

export const myRecordsQueryKey = ["users", "me"] as const;

export const myScoresQueryKey = [...myRecordsQueryKey, "scores"] as const;

export const myBestScoresQueryKey = [
  ...myRecordsQueryKey,
  "best-scores",
] as const;
