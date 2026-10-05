// 비트맵이 가질 수 있는 난이도다.
// 랭킹뿐 아니라 경기 기록과 향후 비트맵 조회에서도 함께 사용한다.
export type Difficulty = "easy" | "normal" | "hard";

// 곡 선택 화면에서 필요한 채보 요약 정보다.
export type BeatmapSummary = {
  id: string;
  difficulty: Difficulty;
  level: number;
  noteCount: number;
  durationMs: number;
};
