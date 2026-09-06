import { useEffect, useRef } from "react";
import { GameEngine } from "../game/GameEngine";
import type { Note } from "../game/types";

// 이 숫자들은 Canvas 내부 그림판(backing store)의 크기다.
// CSS로 보이는 크기만 늘리는 것과 달리 width/height 속성은 실제 그리기 좌표계를 정한다.
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 720;
const AUDIO_URL = "/audio/sallang-sallang-jeju-gil.mp3";

const SAMPLE_NOTES: Note[] = [
  { id: "note-1", laneIndex: 0, hitTimeMs: 2000 },
  { id: "note-2", laneIndex: 1, hitTimeMs: 3000 },
  { id: "note-3", laneIndex: 2, hitTimeMs: 4000 },
  { id: "note-4", laneIndex: 3, hitTimeMs: 5000 },
];

/**
 * React에서 실제 <canvas> DOM 요소를 만들고 CanvasRenderer에 전달하는 컴포넌트다.
 *
 * 이 컴포넌트는 "어떻게 그릴지"를 알지 않는다.
 * Canvas DOM의 생성과 생명주기만 관리하고, 그리기 책임은 CanvasRenderer에 위임한다.
 */
export const GameCanvas = () => {
  // 첫 React render 시점에는 아직 <canvas> DOM이 생성되기 전이므로 초기값은 null이다.
  // React commit이 끝나면 React가 canvasRef.current에 실제 HTMLCanvasElement를 넣어준다.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);

  const handleStart = async (): Promise<void> => {
    const canvas = canvasRef.current;

    // Canvas가 없거나 게임이 이미 시작됐다면 중복 실행하지 않는다.
    if (canvas === null || gameEngineRef.current !== null) {
      return;
    }

    // 이 함수는 버튼 클릭으로 실행되므로
    // AudioContext.resume()도 사용자 동작 안에서 호출된다.
    const gameEngine = new GameEngine(canvas, SAMPLE_NOTES, AUDIO_URL);

    gameEngineRef.current = gameEngine;

    await gameEngine.start();
  };

  useEffect(() => {
    return () => {
      const gameEngine = gameEngineRef.current;

      if (gameEngine !== null) {
        void gameEngine.dispose();
      }
    };
  }, []);

  return (
    <section
      style={{
        display: "grid",
        placeItems: "center",
        gap: "12px",
        padding: "24px",
      }}
    >
      <button
        type='button'
        onClick={() => {
          void handleStart();
        }}
      >
        게임 시작
      </button>
      <canvas
        ref={canvasRef}
        // HTML 속성인 width와 height가 Canvas 내부 픽셀 좌표계의 크기를 결정한다.
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        // CSS는 페이지에서 Canvas DOM 요소가 보이는 크기를 조절한다.
        // 내부 크기와 같은 너비로 표시하되 작은 화면에서는 비율을 유지하며 줄인다.
        style={{
          display: "block",
          width: `${CANVAS_WIDTH}px`,
          maxWidth: "100%",
          height: "auto",
          border: "1px solid #374151",
        }}
        aria-label='D, F, J, K 네 개의 레인이 있는 리듬게임 화면'
      >
        Canvas를 지원하는 브라우저가 필요합니다.
      </canvas>
    </section>
  );
};
