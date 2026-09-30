import type { GameResult } from "../game/types";
import styles from "./SoloResult.module.css";

type SoloResultProps = {
  result: GameResult;
  saveStatus: "saving" | "saved" | "error";
  saveError: string | null;
  onRetry: () => void;
};

/**
 * GameEngine이 계산한 한 판의 최종 결과를 표시한다.
 * 점수와 판정 통계뿐 아니라 서버 저장 상태와 재시도 동작도 표시한다.
 */
export const SoloResult = ({
  result,
  saveStatus,
  saveError,
  onRetry,
}: SoloResultProps) => {
  return (
    <section className={styles.container} aria-label="솔로 게임 결과">
      <p className={styles.eyebrow}>GAME RESULT</p>
      <h2 className={styles.score}>{result.score.toLocaleString("ko-KR")}</h2>

      <dl className={styles.judgments}>
        <div>
          <dt>PERFECT</dt>
          <dd>{result.perfectCount}</dd>
        </div>
        <div>
          <dt>GREAT</dt>
          <dd>{result.greatCount}</dd>
        </div>
        <div>
          <dt>GOOD</dt>
          <dd>{result.goodCount}</dd>
        </div>
        <div>
          <dt>MISS</dt>
          <dd>{result.missCount}</dd>
        </div>
      </dl>

      <p className={styles.maxCombo}>
        MAX COMBO <strong>{result.maxCombo}</strong>
      </p>

      {saveStatus === "saving" ? (
        <p className={styles.saveStatus} role="status">
          결과 저장 중...
        </p>
      ) : saveStatus === "saved" ? (
        <p className={styles.saveSuccess} role="status">
          결과가 저장되었습니다.
        </p>
      ) : (
        <div className={styles.saveError} role="alert">
          <p>{saveError ?? "게임 결과를 저장하지 못했습니다."}</p>
          <button type="button" onClick={onRetry}>
            다시 저장
          </button>
        </div>
      )}
    </section>
  );
};
