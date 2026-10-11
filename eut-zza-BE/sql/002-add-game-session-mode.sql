-- 기존 개발 DB의 game_sessions에 명시적인 플레이 모드를 추가한다.
-- Migration Runner가 이 파일 전체를 하나의 Transaction으로 실행한다.

ALTER TABLE game_sessions
ADD COLUMN mode TEXT;

-- mode 도입 전에 만든 행은 학습용 데이터이므로 solo로 분류한다.
-- 앞으로 생성하는 모든 경기는 애플리케이션이 mode를 명시해야 한다.
UPDATE game_sessions
SET mode = 'solo';

ALTER TABLE game_sessions
ALTER COLUMN mode SET NOT NULL;

ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_mode_check
CHECK (mode IN ('solo', 'multiplayer'));
