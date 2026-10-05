-- 멀티플레이 경기의 서버 종료 시각과 참가자별 결과 상태를 관리한다.
-- 한 번 적용한 DB에는 다시 실행하지 않는다.

BEGIN;

ALTER TABLE beatmaps
ADD COLUMN duration_ms INTEGER;

-- 현재 학습용 채보의 마지막 노트는 약 60초에 끝난다.
UPDATE beatmaps
SET duration_ms = 60000;

ALTER TABLE beatmaps
ALTER COLUMN duration_ms SET NOT NULL;

ALTER TABLE beatmaps
ADD CONSTRAINT beatmaps_duration_ms_check
CHECK (duration_ms > 0);

ALTER TABLE game_players
ADD COLUMN result_status TEXT NOT NULL DEFAULT 'playing';

ALTER TABLE game_players
ADD CONSTRAINT game_players_result_status_check
CHECK (result_status IN ('playing', 'submitted', 'disconnected', 'timed_out'));

ALTER TABLE game_players
ADD COLUMN finished_at TIMESTAMPTZ;

COMMIT;
