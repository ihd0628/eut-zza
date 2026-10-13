import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { SAMPLE_NOTES } from "../constants";
import type { AudioManager } from "../game/AudioManager";
import { GameEngine } from "../game/GameEngine";
import { CanvasRenderer } from "../game/CanvasRenderer";
import { RecordArtwork } from "./RecordArtwork";
import type {
  GameJudgmentEvent,
  GameProgress,
  GameResult,
  Judgment,
} from "../game/types";
import styles from "./GameCanvas.module.css";

// 이 숫자들은 Canvas 내부 그림판(backing store)의 크기다.
// CSS로 보이는 크기만 늘리는 것과 달리 width/height 속성은 실제 그리기 좌표계를 정한다.
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 720;
const FEEDBACK_DURATION_MS = 650;
const GAME_KEYS = ["D", "F", "J", "K"] as const;

type JudgmentFeedback = {
  id: number;
  judgment: Judgment;
};

/**
 * React에서 실제 <canvas> DOM 요소를 만들고 CanvasRenderer에 전달하는 컴포넌트다.
 *
 * 이 컴포넌트는 "어떻게 그릴지"를 알지 않는다.
 * Canvas DOM의 생명주기와 주변 HUD를 관리하고, 그리기 책임은 CanvasRenderer에 위임한다.
 */
type GameCanvasProps = {
  songTitle: string;
  difficulty: string;
  sidePanel?: ReactNode;
  audioUrl: string;
  onCreateGame: () => Promise<void>;
  onComplete: (result: GameResult) => void;
  audioManager?: AudioManager;
  startAtClientMs?: number;
  onProgress?: (progress: GameProgress) => void;
};

type StartStatus = "idle" | "starting" | "running" | "completed";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "게임을 시작하지 못했습니다.";
};

export const GameCanvas = ({
  songTitle,
  difficulty,
  sidePanel,
  audioUrl,
  onCreateGame,
  onComplete,
  audioManager,
  startAtClientMs,
  onProgress,
}: GameCanvasProps) => {
  // 첫 React render 시점에는 아직 <canvas> DOM이 생성되기 전이므로 초기값은 null이다.
  // React commit이 끝나면 React가 canvasRef.current에 실제 HTMLCanvasElement를 넣어준다.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const startInProgressRef = useRef(false);
  const mountedRef = useRef(false);
  const feedbackIdRef = useRef(0);
  const feedbackTimersRef = useRef<Array<number | null>>([
    null,
    null,
    null,
    null,
  ]);
  const [startStatus, setStartStatus] = useState<StartStatus>("idle");
  const [startError, setStartError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GameProgress>({
    score: 0,
    combo: 0,
  });
  const [feedbackByLane, setFeedbackByLane] = useState<
    Array<JudgmentFeedback | null>
  >([null, null, null, null]);
  // HUD는 판정이 발생할 때만 갱신한다. 매 프레임의 노트 이동은 여전히 Canvas가 담당한다.
  const handleProgress = useCallback(
    (next: GameProgress) => {
      setProgress(next);
      onProgress?.(next);
    },
    [onProgress],
  );

  const handleJudgment = useCallback(
    ({ laneIndex, judgment }: GameJudgmentEvent) => {
      if (!mountedRef.current) return;

      // 빠른 연타는 같은 레인의 이전 표시만 교체한다. 다른 레인의 판정은 유지한다.
      const id = ++feedbackIdRef.current;
      const previousTimer = feedbackTimersRef.current[laneIndex];
      if (previousTimer !== null) window.clearTimeout(previousTimer);

      setFeedbackByLane((current) =>
        current.map((feedback, index) =>
          index === laneIndex ? { id, judgment } : feedback,
        ),
      );
      feedbackTimersRef.current[laneIndex] = window.setTimeout(() => {
        setFeedbackByLane((current) =>
          current.map((feedback, index) =>
            index === laneIndex && feedback?.id === id ? null : feedback,
          ),
        );
        feedbackTimersRef.current[laneIndex] = null;
      }, FEEDBACK_DURATION_MS);
    },
    [],
  );

  const handleStart = useCallback(async (): Promise<void> => {
    const canvas = canvasRef.current;

    // Canvas가 없거나 게임이 이미 시작됐다면 중복 실행하지 않는다.
    if (
      canvas === null ||
      gameEngineRef.current !== null ||
      startInProgressRef.current
    ) {
      return;
    }

    startInProgressRef.current = true;
    setStartStatus("starting");
    setStartError(null);

    // 음원은 사용자가 선택한 서버 데이터에서 가져온다.
    // 노트 데이터는 서버 채보 API를 만들기 전까지 기존 SAMPLE_NOTES를 사용한다.
    const gameEngine = new GameEngine(
      canvas,
      SAMPLE_NOTES,
      audioUrl,
      (result) => {
        if (!mountedRef.current) {
          return;
        }

        setStartStatus("completed");
        onComplete(result);
      },
      audioManager,
      handleProgress,
      handleJudgment,
    );

    gameEngineRef.current = gameEngine;

    try {
      // prepare()는 이 클릭 handler 안에서 즉시 AudioContext.resume()을 요청한다.
      // 서버 경기 생성과 음원 다운로드·디코딩은 서로 독립적이므로 함께 기다린다.
      await Promise.all([gameEngine.prepare(), onCreateGame()]);

      // 준비 도중 다른 화면으로 이동했다면 음악과 GameLoop를 시작하지 않는다.
      if (!mountedRef.current || gameEngineRef.current !== gameEngine) {
        await gameEngine.dispose();
        return;
      }

      const delayMs =
        startAtClientMs === undefined ? 0 : startAtClientMs - Date.now();
      gameEngine.start(delayMs);
      setStartStatus("running");
    } catch (error: unknown) {
      if (gameEngineRef.current === gameEngine) {
        gameEngineRef.current = null;
      }

      await gameEngine.dispose();
      startInProgressRef.current = false;

      if (mountedRef.current) {
        setStartStatus("idle");
        setStartError(getErrorMessage(error));
      }
    }
  }, [
    audioManager,
    audioUrl,
    onComplete,
    onCreateGame,
    handleProgress,
    handleJudgment,
    startAtClientMs,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    const feedbackTimers = feedbackTimersRef.current;
    if (canvasRef.current !== null) {
      new CanvasRenderer(canvasRef.current).render([], 0);
    }

    return () => {
      mountedRef.current = false;
      startInProgressRef.current = false;
      for (const timer of feedbackTimers) {
        if (timer !== null) window.clearTimeout(timer);
      }

      const gameEngine = gameEngineRef.current;

      if (gameEngine !== null) {
        gameEngineRef.current = null;
        void gameEngine.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (startAtClientMs === undefined) return;

    // 개발 모드의 Effect 재실행에서도 첫 예약을 정리할 수 있게 Task로 시작한다.
    const autoStartTimer = window.setTimeout(() => {
      void handleStart();
    }, 0);

    return () => window.clearTimeout(autoStartTimer);
  }, [handleStart, startAtClientMs]);

  return (
    <section className={styles.container} aria-label="리듬게임 플레이">
      <header className={styles.trackHeader}>
        <span className={styles.brand}>eut-zza</span>
        <div className={styles.trackInfo}>
          <span>{sidePanel ? "MULTIPLAYER" : "SOLO PLAY"} / NOW PLAYING</span>
          <h1>{songTitle}</h1>
        </div>
        <span className={styles.difficulty}>{difficulty}</span>
      </header>
      <div className={styles.cockpit}>
        <aside className={styles.scorePanel} aria-label="내 실시간 점수">
          <p className={styles.panelTitle}>PLAYER / YOU</p>
          <div className={styles.scoreBlock}>
            <span>SCORE</span>
            <strong>
              {progress.score.toLocaleString("ko-KR", {
                minimumIntegerDigits: 6,
              })}
            </strong>
          </div>
          <div className={styles.comboBlock}>
            <strong>{progress.combo.toString().padStart(3, "0")}</strong>
            <span>COMBO</span>
          </div>
          <div className={styles.keyGuide}>
            <span>CONTROL / 4 KEY</span>
            <div>
              {GAME_KEYS.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </div>
            <p>
              노트가 판정선에 닿을 때<br />
              해당 키를 누르세요.
            </p>
          </div>
          {startStatus === "idle" && startAtClientMs === undefined ? (
            <Link className={styles.backLink} to="/solo">
              ← 곡 다시 선택
            </Link>
          ) : null}
        </aside>
        <div className={styles.laneFrame}>
          <div className={styles.laneTop}>
            <span>4 KEY</span>
            <span>{startStatus === "running" ? "PLAY" : "STANDBY"}</span>
          </div>
          <div className={styles.canvasWrap}>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className={styles.canvas}
              aria-label="D, F, J, K 네 개의 레인이 있는 리듬게임 화면"
            >
              Canvas를 지원하는 브라우저가 필요합니다.
            </canvas>
            <div className={styles.judgmentFeedback} aria-hidden="true">
              {GAME_KEYS.map((key, laneIndex) => {
                const feedback = feedbackByLane[laneIndex];

                return (
                  <div key={key} className={styles.feedbackLane}>
                    {feedback === null ? null : (
                      <span
                        key={feedback.id}
                        className={styles.feedbackLabel}
                        data-judgment={feedback.judgment}
                      >
                        {feedback.judgment !== "MISS" ? (
                          <span className={styles.hitBurst} />
                        ) : null}
                        {feedback.judgment}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {startStatus === "idle" || startStatus === "starting" ? (
              <div className={styles.startOverlay}>
                <p>ARE YOU READY?</p>
                <button
                  className={styles.startButton}
                  type="button"
                  disabled={
                    startAtClientMs !== undefined || startStatus !== "idle"
                  }
                  onClick={() => {
                    void handleStart();
                  }}
                >
                  {startStatus === "starting"
                    ? "게임 준비 중..."
                    : startAtClientMs !== undefined
                      ? "동기화된 시작 대기 중"
                      : "게임 시작"}
                </button>
              </div>
            ) : null}
            {startError === null ? null : (
              <p className={styles.error} role="alert">
                {startError}
              </p>
            )}
          </div>
        </div>
        <aside className={styles.rightPanel}>
          {sidePanel ?? (
            <>
              <p className={styles.panelTitle}>SOUND SELECTED</p>
              <RecordArtwork />
              <p className={styles.soloCaption}>
                JUST YOU.
                <br />
                AND THE RHYTHM.
              </p>
              <span className={styles.chartInfo}>
                4 KEY / {SAMPLE_NOTES.length} NOTES
              </span>
            </>
          )}
        </aside>
      </div>
      <footer className={styles.stageFooter}>
        <span>KEEP YOUR RHYTHM.</span>
        <span>DF / JK</span>
      </footer>
    </section>
  );
};
