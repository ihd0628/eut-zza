import { useQuery } from "@tanstack/react-query";
import { getMyBestScores, getMyScores } from "../api/user-api";
import { myBestScoresQueryKey, myScoresQueryKey } from "../query/query-keys";
import styles from "./MyRecords.module.css";

const formatScore = (score: number): string => score.toLocaleString("ko-KR");

export const MyRecords = () => {
  const scoresQuery = useQuery({
    queryKey: myScoresQueryKey,
    queryFn: getMyScores,
  });
  const bestScoresQuery = useQuery({
    queryKey: myBestScoresQueryKey,
    queryFn: getMyBestScores,
  });

  if (scoresQuery.isPending || bestScoresQuery.isPending) {
    return <p className={styles.status}>내 기록을 불러오고 있습니다.</p>;
  }

  if (scoresQuery.isError || bestScoresQuery.isError) {
    const error = scoresQuery.error ?? bestScoresQuery.error;

    return (
      <section className={styles.statusPanel}>
        <p className={styles.error} role="alert">
          내 기록을 불러오지 못했습니다: {error?.message}
        </p>
        <button
          className={styles.retryButton}
          type="button"
          onClick={() => {
            void scoresQuery.refetch();
            void bestScoresQuery.refetch();
          }}
        >
          다시 시도
        </button>
      </section>
    );
  }

  return (
    <section className={styles.container} aria-labelledby="my-records-title">
      <header className={styles.header}>
        <p className={styles.eyebrow}>MY RECORDS</p>
        <h1 id="my-records-title" className={styles.title}>
          MY RECORDS
        </h1>
        <p className={styles.description}>
          곡·난이도별 최고 점수와 최근 20번의 플레이를 확인할 수 있습니다.
        </p>
      </header>

      <section
        className={styles.recordSection}
        aria-labelledby="best-scores-title"
      >
        <h2 id="best-scores-title" className={styles.sectionTitle}>
          최고 점수
        </h2>
        {bestScoresQuery.data.length === 0 ? (
          <p className={styles.emptyState}>아직 저장된 최고 점수가 없습니다.</p>
        ) : (
          <div className={styles.bestScoreGrid}>
            {bestScoresQuery.data.map((entry) => (
              <article className={styles.bestScoreCard} key={entry.beatmapId}>
                <div>
                  <p className={styles.songTitle}>{entry.songTitle}</p>
                  <p className={styles.difficulty}>
                    {entry.difficulty.toUpperCase()}
                  </p>
                </div>
                <strong className={styles.bestScore}>
                  {formatScore(entry.bestScore)}
                </strong>
                <span className={styles.playCount}>
                  {entry.playCount}회 플레이
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className={styles.recordSection}
        aria-labelledby="recent-scores-title"
      >
        <h2 id="recent-scores-title" className={styles.sectionTitle}>
          최근 기록
        </h2>
        {scoresQuery.data.length === 0 ? (
          <p className={styles.emptyState}>
            아직 저장된 플레이 기록이 없습니다.
          </p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.scoreTable}>
              <thead>
                <tr>
                  <th scope="col">곡</th>
                  <th scope="col">난이도</th>
                  <th scope="col">점수</th>
                  <th scope="col">최대 콤보</th>
                </tr>
              </thead>
              <tbody>
                {scoresQuery.data.map((entry) => (
                  <tr key={entry.scoreId}>
                    <td>{entry.songTitle}</td>
                    <td>{entry.difficulty.toUpperCase()}</td>
                    <td>{formatScore(entry.score)}</td>
                    <td>{entry.maxCombo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
};
