// PostgreSQL 집계와 Redis Sorted Set에 저장할 사용자별 최고 기록이다.
export type RankingScoreEntry = {
  userId: string;
  email: string;
  bestScore: number;
  playCount: number;
};

// API에는 동점 사용자가 같은 등수를 갖는 competition ranking을 함께 반환한다.
export type RankingEntry = RankingScoreEntry & {
  rank: number;
};
