import type { GameResult } from "../game/types";
import styles from "./SoloResult.module.css";

type SoloResultProps = {
  result: GameResult;
};

/**
 * GameEngine이 계산한 한 판의 최종 결과를 표시한다.
 * 이번 단계에서는 브라우저에 보여주기만 하고, 서버 저장은 다음 단계에서 연결한다.
 */
export const SoloResult = ({ result }: SoloResultProps) => {
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
    </section>
  );
};
