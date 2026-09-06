/**
 * 게임 엔진의 진입점이자 조정자 역할을 담당한다.
 *
 * React는 canvas 태그를 화면에 배치하고 메뉴·점수 패널 같은 UI를 담당한다.
 * 이 파일의 GameEngine은 React와 독립적으로 게임의 실시간 동작을 관리한다.
 *
 * 이후 이 파일에는 다음 기능이 들어간다.
 * - GameLoop과 InputManager 생성 및 연결
 * - 게임 시작, 일시 정지, 재개, 종료
 * - 현재 게임 상태(GameState) 보관
 * - 매 프레임 게임 상태 갱신(update)과 Canvas 렌더링(render) 호출
 * - Week 2부터 음악 시간, 노트, 판정, 점수 계산 모듈 연결
 *
 * 이 파일에는 React 컴포넌트, JSX, useState를 넣지 않는다.
 */

import { AudioManager } from "./AudioManager";
import { CanvasRenderer } from "./CanvasRenderer";
import { GameLoop } from "./GameLoop";
import { InputManager } from "./InputManager";
import type { GameInputEvent, Note } from "./types";

export class GameEngine {
  private readonly gameLoop: GameLoop;
  private readonly inputManager: InputManager;
  private readonly renderer: CanvasRenderer;
  private readonly notes: Note[];
  private readonly audioManager: AudioManager;
  private readonly audioUrl: string;

  constructor(canvas: HTMLCanvasElement, notes: Note[], audioUrl: string) {
    this.audioManager = new AudioManager();
    this.renderer = new CanvasRenderer(canvas);
    this.notes = notes;
    this.audioUrl = audioUrl;

    this.gameLoop = new GameLoop(this.handleFrame);
    this.inputManager = new InputManager(this.handleInput);
  }

  async start(): Promise<void> {
    // 먼저 AudioContext를 running 상태로 만들고
    // 게임 시간 0의 기준을 저장한다.
    await this.audioManager.start(this.audioUrl);

    // 오디오 clock이 준비된 뒤 입력과 화면 갱신을 시작한다.
    this.inputManager.attach();
    this.gameLoop.start();
  }
  stop() {
    // 화면 갱신과 입력 중단
    this.gameLoop.stop();
    this.inputManager.detach();
  }
  async dispose(): Promise<void> {
    // stop() 실행
    // AudioContext까지 완전히 종료
    this.stop();
    await this.audioManager.close();
  }

  private handleFrame = () => {
    // requestAnimationFrame timestamp가 아니라
    // AudioContext clock을 현재 게임 시간으로 사용한다.
    const currentTimeMs = this.audioManager.getCurrentTimeMs();

    this.renderer.render(this.notes, currentTimeMs);
  };
  private handleInput = (event: GameInputEvent) => {
    console.log(event);
  };
}
