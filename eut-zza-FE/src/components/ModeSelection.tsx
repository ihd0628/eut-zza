import styles from "./ModeSelection.module.css";

export type PlayMode = "solo" | "multiplayer";

type ModeSelectionProps = {
  onSelect: (mode: PlayMode) => void;
  onShowRecords: () => void;
};

/**
 * 로그인한 사용자가 플레이 방식을 선택하는 화면이다.
 *
 * 여기서 선택한 값은 현재 어떤 화면을 보여줄지 결정하는 UI 상태다.
 * 실제 경기의 mode는 이후 서버가 game_sessions를 만들 때 별도로 저장한다.
 */
export const ModeSelection = ({
  onSelect,
  onShowRecords,
}: ModeSelectionProps) => {
  return (
    <section
      className={styles.container}
      aria-labelledby="mode-selection-title"
    >
      <div className={styles.headingGroup}>
        <p className={styles.eyebrow}>SELECT YOUR MODE / 01</p>
        <h1 id="mode-selection-title" className={styles.title}>
          FEEL THE <span>BEAT.</span>
        </h1>
        <p className={styles.description}>
          네 개의 키, 당신만의 리듬. 플레이 모드를 선택하세요.
        </p>
      </div>

      <div className={styles.modeGrid}>
        <button
          className={styles.modeCard}
          type="button"
          onClick={() => onSelect("solo")}
        >
          <span className={styles.modeBadge}>SOLO</span>
          <span className={styles.modeGraphic} aria-hidden="true">
            01
          </span>
          <strong className={styles.modeTitle}>솔로 플레이</strong>
          <span className={styles.modeDescription}>
            곡과 난이도를 선택하고 개인 기록에 도전합니다.
          </span>
          <span className={styles.modeAction}>
            1 PLAYER <b>솔로 플레이 시작 ↗</b>
          </span>
        </button>

        <button
          className={styles.modeCard}
          type="button"
          onClick={() => onSelect("multiplayer")}
        >
          <span className={styles.modeBadge}>MULTIPLAYER</span>
          <span className={styles.modeGraphic} aria-hidden="true">
            04
          </span>
          <strong className={styles.modeTitle}>멀티플레이</strong>
          <span className={styles.modeDescription}>
            방을 만들거나 입장해 최대 4명의 플레이어와 대전합니다.
          </span>
          <span className={styles.modeAction}>
            2–4 PLAYERS <b>대전 로비 입장 ↗</b>
          </span>
        </button>
      </div>

      <button
        className={styles.recordsButton}
        type="button"
        onClick={onShowRecords}
      >
        MY RECORDS <span>내 기록 확인 ↗</span>
      </button>
    </section>
  );
};
