/**
 * requestAnimationFrame 기반의 게임 루프를 담당한다.
 *
 * 브라우저가 다음 화면을 그리기 직전에 호출하는 requestAnimationFrame을 사용해
 * 매 프레임 현재 시간과 이전 프레임 이후 경과 시간(deltaTime)을 계산한다.
 *
 * 이후 이 파일에는 다음 기능이 들어간다.
 * - 프레임마다 실행할 콜백(FrameCallback) 등록
 * - start(): requestAnimationFrame 루프 시작
 * - stop(): 예약된 프레임 취소 및 루프 중지
 * - requestAnimationFrame callback의 timestamp를 사용한 deltaTime 계산
 * - start()를 여러 번 호출해도 루프가 중복 실행되지 않도록 보호
 *
 * 게임 규칙, 키보드 입력, Canvas 렌더링은 이 파일의 책임이 아니다.
 */

type FrameCallback = (timestamp: number, deltaTime: number) => void;

export class GameLoop {
  private animationFrameId: number | null = null;
  private previousTimestamp: number | null = null;
  private isRunning = false;
  private readonly onFrame: FrameCallback;

  constructor(onFrame: FrameCallback) {
    this.onFrame = onFrame;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.previousTimestamp = null;
    this.animationFrameId = requestAnimationFrame(this.frame);
  }

  stop() {
    this.isRunning = false;
    this.previousTimestamp = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private frame = (timestamp: number) => {
    if (!this.isRunning) return;

    const deltaTime =
      this.previousTimestamp !== null ? timestamp - this.previousTimestamp : 0;
    this.previousTimestamp = timestamp;
    this.onFrame(timestamp, deltaTime);

    if (this.isRunning) {
      this.animationFrameId = requestAnimationFrame(this.frame);
    }
  };
}
