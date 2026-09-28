import type { Difficulty } from "./beatmap.js";

export type CreateScoreInput = {
  gamePlayerId: string;
  score: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  maxCombo: number;
};

export type Score = CreateScoreInput & {
  id: string;
};

// 사용자 기록 화면에 필요한 여러 테이블의 조회 결과다.
export type UserScoreEntry = {
  scoreId: string;
  gameSessionId: string;
  songTitle: string;
  difficulty: Difficulty;
  score: number;
  maxCombo: number;
};

// PostgreSQL의 오류 코드나 제약 조건 이름을 외부 계층에 노출하지 않기 위해
// Repository가 DB 오류를 아래 애플리케이션 오류로 변환한다.
export class ScoreAlreadyExistsError extends Error {
  constructor() {
    super("Score already exists for this game player");
    this.name = "ScoreAlreadyExistsError";
  }
}

export class GamePlayerNotFoundError extends Error {
  constructor() {
    super("Game player not found");
    this.name = "GamePlayerNotFoundError";
  }
}

export class ScoreSubmissionForbiddenError extends Error {
  constructor() {
    super("You cannot submit a score for this game player");
    this.name = "ScoreSubmissionForbiddenError";
  }
}
