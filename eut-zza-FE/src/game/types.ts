/**
 * game 폴더의 여러 모듈이 함께 사용하는 TypeScript 타입을 정의한다.
 *
 * 타입을 한곳에 모아두면 GameEngine, GameLoop, InputManager가
 * 같은 데이터 구조와 함수 계약을 공유할 수 있다.
 *
 * 이후 이 파일에는 다음 타입이 들어간다.
 * - 게임에 사용하는 키: D, F, J, K
 * - 프레임 콜백: 현재 시간과 deltaTime을 받는 함수
 * - 게임 상태: 점수, 콤보, HP, 게임 진행 상태 등
 * - 입력 이벤트: 어떤 키가 언제 눌렸는지 나타내는 데이터
 * - Week 2 이후 노트, 비트맵, 판정(PERFECT/GREAT/GOOD/MISS) 관련 타입
 *
 * 이 파일에는 실행되는 게임 로직이 아니라 타입과 인터페이스만 둔다.
 */

export type GameKey = "D" | "F" | "J" | "K";

export type InputType = "down" | "up";

export interface GameInputEvent {
  key: GameKey;
  type: InputType;
  timestamp: number;
}

export type InputCallback = (event: GameInputEvent) => void;

export type LaneIndex = 0 | 1 | 2 | 3;

export interface Note {
  id: string;
  laneIndex: LaneIndex;
  hitTimeMs: number;
}

export type Judgment = "PERFECT" | "GREAT" | "GOOD" | "MISS";
