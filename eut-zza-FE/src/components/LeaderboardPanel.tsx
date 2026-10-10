import { useQuery } from "@tanstack/react-query";
import { getSongRanking, type Difficulty } from "../api/song-api";
import { songRankingQueryKey } from "../query/query-keys";
import styles from "./LeaderboardPanel.module.css";

type LeaderboardPanelProps = {
  songId: string;
  difficulty: Difficulty;
};

export const LeaderboardPanel = ({
  songId,
  difficulty,
}: LeaderboardPanelProps) => {
  const rankingQuery = useQuery({
    queryKey: songRankingQueryKey(songId, difficulty),
    queryFn: () => getSongRanking(songId, difficulty),
  });

  return (
    <section className={styles.panel} aria-labelledby="leaderboard-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>LEADERBOARD</p>
          <h2 id="leaderboard-title">최고 점수</h2>
        </div>
        <span>{difficulty.toUpperCase()}</span>
      </div>

      {rankingQuery.isPending ? <p>랭킹을 불러오고 있습니다.</p> : null}
      {rankingQuery.isError ? (
        <p className={styles.error} role="alert">
          랭킹을 불러오지 못했습니다: {rankingQuery.error.message}
        </p>
      ) : null}
      {rankingQuery.data?.length === 0 ? <p>아직 등록된 기록이 없습니다.</p> : null}
      {rankingQuery.data !== undefined && rankingQuery.data.length > 0 ? (
        <ol className={styles.ranking}>
          {rankingQuery.data.map((entry) => (
            <li key={entry.userId} className={styles.entry}>
              <strong className={styles.rank}>{entry.rank}위</strong>
              <span className={styles.email}>{entry.email}</span>
              <span className={styles.score}>{entry.bestScore.toLocaleString()}점</span>
              <small>{entry.playCount}회 플레이</small>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
};
