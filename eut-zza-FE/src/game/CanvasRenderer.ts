/**
 * 리듬게임 화면을 Canvas 2D API로 그리는 클래스다.
 *
 * React는 <canvas> DOM 요소를 화면에 배치하는 일만 담당하고,
 * 실제 게임 화면을 어떤 순서로 그릴지는 이 클래스가 담당한다.
 * 따라서 이 파일에는 React, JSX, useState 같은 개념이 들어가지 않는다.
 */

// 네 개의 레인에 표시할 키다.
// `as const`를 붙이면 단순한 string[]이 아니라 읽기 전용 리터럴 목록으로 추론된다.
const GAME_KEYS = ["D", "F", "J", "K"] as const;

// 판정선은 Canvas 아래쪽에서 100px 위에 배치한다.
const JUDGMENT_LINE_BOTTOM_OFFSET = 100;

export class CanvasRenderer {
  // HTMLCanvasElement는 페이지에 존재하는 실제 <canvas> DOM 요소다.
  private readonly canvas: HTMLCanvasElement;

  // CanvasRenderingContext2D는 Canvas에 사각형, 선, 글자 등을 그릴 수 있는 도구다.
  private readonly context: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // "2d" Context를 요청하면 Canvas 2D API를 사용할 수 있다.
    // 브라우저가 Context를 제공하지 못할 수도 있으므로 반환 타입에는 null이 포함된다.
    const context = canvas.getContext("2d");

    if (context === null) {
      // Context가 없으면 게임 화면을 그릴 방법이 없으므로 즉시 실패시킨다.
      // 이렇게 하면 뒤에서 알 수 없는 오류가 발생하는 대신 원인을 바로 확인할 수 있다.
      throw new Error("Canvas 2D context를 생성할 수 없습니다.");
    }

    this.context = context;
  }

  /**
   * 한 프레임의 전체 게임 화면을 그리는 진입점이다.
   *
   * Canvas는 이전에 그린 사각형이나 선을 DOM 요소처럼 기억하지 않는다.
   * 그래서 화면을 갱신할 때는 이전 프레임을 지우고 현재 상태를 순서대로 다시 그린다.
   *
   * Canvas는 DOM처럼 z-index나 요소별 레이어를 관리하지 않고,
   * 나중에 그린 것이 먼저 그린 픽셀 위를 덮는 방식이다.
   * 그림 그리는 순서를 뒤쪽에서 앞쪽으로 배치한 거다.
   */
  render(): void {
    this.clear();
    this.drawBackground();
    this.drawLanes();
    this.drawJudgmentLine();
    this.drawLaneLabels();
  }

  /** 이전 프레임의 모든 픽셀을 투명하게 지운다. */
  private clear(): void {
    // Canvas 좌표는 왼쪽 위 (0, 0)에서 시작한다.
    // Canvas 전체 크기만큼 clearRect를 호출해 모든 영역을 지운다.
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Canvas 전체를 게임판의 기본 배경색으로 채운다. */
  private drawBackground(): void {
    // fillStyle은 이후 실행되는 채우기 명령이 사용할 색상을 정한다.
    this.context.fillStyle = "#111827";

    // fillRect(x, y, width, height)는 지정한 영역을 현재 fillStyle로 채운다.
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 네 개의 레인 배경과 레인 사이의 세로 구분선을 그린다. */
  private drawLanes(): void {
    // Canvas 전체 너비를 키 개수로 나누면 레인 하나의 너비가 된다.
    // 현재 Canvas가 480px이므로 각 레인의 너비는 120px이다.
    const laneWidth = this.canvas.width / GAME_KEYS.length;

    // 인접한 레인을 쉽게 구분할 수 있도록 아주 옅은 배경을 번갈아 그린다.
    // fillRect는 현재 path와 무관하게 사각형을 즉시 채운다.
    for (let laneIndex = 0; laneIndex < GAME_KEYS.length; laneIndex += 1) {
      const laneX = laneIndex * laneWidth;

      this.context.fillStyle =
        laneIndex % 2 === 0
          ? "rgba(255, 255, 255, 0.03)"
          : "rgba(255, 255, 255, 0.07)";
      this.context.fillRect(laneX, 0, laneWidth, this.canvas.height);
    }

    // beginPath()는 이전 선 경로를 비우고 새로운 경로 작성을 시작한다.
    // 즉, 이전 경로 정보를 비운다.
    this.context.beginPath();
    // 사용할 펜의 색상을 설정한다.
    this.context.strokeStyle = "#4b5563";
    // 사용할 펜의 두께를 설정한다.
    this.context.lineWidth = 1;

    // 레인이 네 개이면 내부 구분선은 세 개만 필요하다.
    // x 좌표만 laneWidth씩 증가시키고, y는 위(0)부터 아래(canvas.height)까지 잇는다.
    // moveTo()는 선을 그리지 않고 가상의 펜을 시작점으로 옮긴다.
    // lineTo()는 현재 위치에서 지정한 위치까지 이어지는 경로를 등록한다.

    for (let lineIndex = 1; lineIndex < GAME_KEYS.length; lineIndex += 1) {
      const lineX = lineIndex * laneWidth;

      this.context.moveTo(lineX, 0);
      this.context.lineTo(lineX, this.canvas.height);
    }

    // 앞에서 만든 세 개의 경로를 실제 선으로 한 번에 그린다.
    this.context.stroke();

    // beginPath()   → 현재 Context에 남은 이전 경로 정보를 비운다
    // strokeStyle   → 붓 색을 고른다
    // lineWidth     → 붓 두께를 고른다
    // moveTo()      → 붓을 시작 위치로 옮긴다
    // lineTo()      → 어디까지 선을 그을지 밑그림을 만든다
    // stroke()      → 밑그림을 따라 실제로 칠한다
  }

  /** 노트를 입력해야 하는 기준 위치인 판정선을 그린다. */
  private drawJudgmentLine(): void {
    const judgmentLineY = this.canvas.height - JUDGMENT_LINE_BOTTOM_OFFSET;

    this.context.beginPath();
    this.context.strokeStyle = "#facc15";
    this.context.lineWidth = 4;

    // 판정선은 Canvas의 왼쪽 끝에서 오른쪽 끝까지 이어지는 가로선이다.
    // 가로선이므로 y는 같고 x만 0에서 canvas.width까지 변한다.
    this.context.moveTo(0, judgmentLineY);
    this.context.lineTo(this.canvas.width, judgmentLineY);
    this.context.stroke();
  }

  /** 판정선 아래에 각 레인을 담당하는 D/F/J/K 키를 표시한다. */
  private drawLaneLabels(): void {
    const laneWidth = this.canvas.width / GAME_KEYS.length;

    // Canvas의 글자 그리기 설정도 Context가 기억하는 상태다.

    // 앞으로 실행되는 채우기 작업의 색상을 밝은 회색으로 설정한다.
    // 현재는 뒤에서 fillText()를 호출하므로 글자의 내부 색상이 #f9fafb가 된다.
    // 우리 코드에서는 앞의 drawLanes()가 레인 배경을 그리려고 fillStyle을 변경했다.
    // this.context.fillStyle = "rgba(255, 255, 255, 0.03)";
    // Canvas Context는 이 설정을 계속 기억한다. 따라서 글자를 그리기 전에 다시 밝은 색으로 변경해야 한다.
    this.context.fillStyle = "#f9fafb";
    // 글자의 모양을 설정한다. CSS의 font 작성 방식과 거의 같다.
    this.context.font = "bold 28px sans-serif";
    // fillText()에 전달하는 x 좌표를 기준으로 글자를 수평 방향에서 어떻게 배치할지 정한다
    this.context.textAlign = "center";
    // fillText()에 전달하는 y 좌표를 기준으로 글자를 수직 방향에서 어떻게 배치할지 정한다.
    // middle로 설정하면 전달한 y 좌표가 글자의 대략적인 수직 중앙 기준이 된다.
    this.context.textBaseline = "middle";

    GAME_KEYS.forEach((key, laneIndex) => {
      // 레인 시작점에서 너비의 절반만큼 이동하면 해당 레인의 중앙 x 좌표가 된다.
      const labelX = laneIndex * laneWidth + laneWidth / 2;

      // 판정선과 Canvas 아래쪽 사이의 중앙에 글자를 배치한다.
      const labelY = this.canvas.height - JUDGMENT_LINE_BOTTOM_OFFSET / 2;

      this.context.fillText(key, labelX, labelY);
    });
  }
}
