import { useEffect, useRef } from "react";
import { CanvasRenderer } from "../game/CanvasRenderer";

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
export const GameCanvas = () => {
  // 첫 React render 시점에는 아직 <canvas> DOM이 생성되기 전이므로 초기값은 null이다.
  // React commit이 끝나면 React가 canvasRef.current에 실제 HTMLCanvasElement를 넣어준다.
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    // 정상적으로 mount됐다면 canvas가 존재한다.
    // 그래도 null 가능성을 검사해야 TypeScript와 런타임 모두에서 안전하다.
    if (canvas === null) return;

    // 실제 DOM이 준비된 뒤 Renderer를 생성한다.
    const renderer = new CanvasRenderer(canvas);

    // 이번 단계에서는 애니메이션 없이 정적인 게임판을 한 번만 그린다.
    renderer.render();

    // 현재 Renderer는 Timer, Event Listener 같은 외부 자원을 만들지 않으므로
    // useEffect cleanup이 필요하지 않다. 이후 GameLoop을 연결할 때는 stop()이 필요하다.
  }, []);

  return (
    <section
      style={{
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
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
