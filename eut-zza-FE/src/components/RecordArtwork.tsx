import styles from "./RecordArtwork.module.css";

/** 음원 커버가 없는 곡에 사용하는 읏짜의 공통 레코드 그래픽. */
export const RecordArtwork = () => (
  <div className={styles.artwork} aria-hidden="true">
    <span className={styles.catalog}>
      EUT / 004
      <br />
      RHYTHM SYSTEM
    </span>
    <div className={styles.disc}>
      <div className={styles.label}>
        읏짜<span>4 KEY SOUND</span>
      </div>
    </div>
    <span className={styles.caption}>THE BEAT GOES ON.</span>
    <span className={styles.corner}>33⅓</span>
  </div>
);
