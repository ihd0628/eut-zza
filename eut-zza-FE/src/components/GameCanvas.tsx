import { useEffect, useRef, useState } from "react";
import { SAMPLE_NOTES } from "../constants";
import { GameEngine } from "../game/GameEngine";
import type { GameResult } from "../game/types";
import styles from "./GameCanvas.module.css";

// 이 숫자들은 Canvas 내부 그림판(backing store)의 크기다.
// CSS로 보이는 크기만 늘리는 것과 달리 width/height 속성은 실제 그리기 좌표계를 정한다.
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 720;

/**
 * React에서 실제 <canvas> DOM 요소를 만들고 CanvasRenderer에 전달하는 컴포넌트다.
 *
 * 이 컴포넌트는 "어떻게 그릴지"를 알지 않는다.
 * Canvas DOM의 생성과 생명주기만 관리하고, 그리기 책임은 CanvasRenderer에 위임한다.
 */
type GameCanvasProps = {
  audioUrl: string;
  onCreateGame: () => Promise<void>;
  onComplete: (result: GameResult) => void;
};

type StartStatus = "idle" | "starting" | "running" | "completed";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "게임을 시작하지 못했습니다.";
};

export const GameCanvas = ({
  audioUrl,
  onCreateGame,
  onComplete,
}: GameCanvasProps) => {
  // 첫 React render 시점에는 아직 <canvas> DOM이 생성되기 전이므로 초기값은 null이다.
  // React commit이 끝나면 React가 canvasRef.current에 실제 HTMLCanvasElement를 넣어준다.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  const startInProgressRef = useRef(false);
  const mountedRef = useRef(false);
  const [startStatus, setStartStatus] = useState<StartStatus>("idle");
  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async (): Promise<void> => {
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

      gameEngine.start();
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
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      startInProgressRef.current = false;

      const gameEngine = gameEngineRef.current;

      if (gameEngine !== null) {
        gameEngineRef.current = null;
        void gameEngine.dispose();
      }
    };
  }, []);

  return (
    <section className={styles.container}>
      <button
        className={styles.startButton}
        type="button"
        disabled={startStatus !== "idle"}
        onClick={() => {
          void handleStart();
        }}
      >
        {startStatus === "starting"
          ? "게임 준비 중..."
          : startStatus === "running"
            ? "게임 진행 중"
            : startStatus === "completed"
              ? "게임 완료"
            : "게임 시작"}
      </button>
      {startError === null ? null : (
        <p className={styles.error} role="alert">
          {startError}
        </p>
      )}
      <canvas
        ref={canvasRef}
        // HTML 속성인 width와 height가 Canvas 내부 픽셀 좌표계의 크기를 결정한다.
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        // CSS는 페이지에서 Canvas DOM 요소가 보이는 크기를 조절한다.
        // 내부 크기와 같은 너비로 표시하되 작은 화면에서는 비율을 유지하며 줄인다.
        className={styles.canvas}
        aria-label="D, F, J, K 네 개의 레인이 있는 리듬게임 화면"
      >
        Canvas를 지원하는 브라우저가 필요합니다.
      </canvas>
    </section>
  );
};
