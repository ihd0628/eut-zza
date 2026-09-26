// 여러 테이블을 JOIN하고 집계해서 만든 곡 랭킹 조회 결과다.
export type RankingEntry = {
  userId: string;
  email: string;
  bestScore: number;
  playCount: number;
};
