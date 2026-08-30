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

import { GameLoop } from "./GameLoop";
import { InputManager } from "./InputManager";
import type { GameInputEvent } from "./types";

export class GameEngine {
  private readonly gameLoop: GameLoop;
  private readonly inputManager: InputManager;
  private lastLoggedAt = 0;

  constructor() {
    this.gameLoop = new GameLoop(this.handleFrame);
    this.inputManager = new InputManager(this.handleInput);
  }

  start() {
    this.inputManager.attach();
    this.gameLoop.start();
  }
  stop() {
    this.gameLoop.stop();
    this.inputManager.detach();
  }

  private handleFrame = (timestamp: number, deltaTime: number) => {
    if (timestamp - this.lastLoggedAt < 1000) return;

    this.lastLoggedAt = timestamp;
    console.log("timestamp : ", timestamp);
    console.log("deltaTime : ", deltaTime);
  };
  private handleInput = (event: GameInputEvent) => {
    console.log(event);
  };
}
