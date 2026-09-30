import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  completeSoloGame,
  startSoloGame,
  type StartedSoloGame,
} from "../api/game-session-api";
import type { GameResult } from "../game/types";
import {
  myBestScoresQueryKey,
  myScoresQueryKey,
} from "../query/query-keys";
import type { SoloGameSelection } from "./SoloSetup";
import { GameCanvas } from "./GameCanvas";
import { SoloResult } from "./SoloResult";
import styles from "./SoloGame.module.css";

type SoloGameProps = {
  selection: SoloGameSelection;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "게임 결과를 저장하지 못했습니다.";
};

/**
 * 선택한 채보로 서버의 솔로 경기를 만들고 GameCanvas를 연결한다.
 *
 * 서버가 반환한 gamePlayerId는 이후 최종 점수를 제출할 때 사용한다.
 * 같은 화면에서 음원 준비를 재시도하더라도 경기를 중복 생성하지 않도록
 * 성공한 결과를 ref에도 보관한다.
 */
export const SoloGame = ({ selection }: SoloGameProps) => {
  const queryClient = useQueryClient();
  const startedGameRef = useRef<StartedSoloGame | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const startGameMutation = useMutation({
    mutationFn: () => startSoloGame(selection.beatmap.id),
  });
  const completeGameMutation = useMutation({
    mutationFn: async (result: GameResult) => {
      const startedGame = startedGameRef.current;

      if (startedGame === null) {
        throw new Error("시작된 솔로 경기 정보가 없습니다.");
      }

      return completeSoloGame(startedGame.gameSession.id, {
        gamePlayerId: startedGame.gamePlayer.id,
        ...result,
      });
    },
    onSuccess: async () => {
      // 이전에 기록 화면을 조회했다면 캐시에는 게임 전 데이터가 남아 있다.
      // 두 Query를 stale 상태로 만들고, 다음 기록 화면 진입 때 최신 값을 받는다.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: myScoresQueryKey }),
        queryClient.invalidateQueries({ queryKey: myBestScoresQueryKey }),
      ]);
    },
  });

  const ensureGameSession = async (): Promise<void> => {
    if (startedGameRef.current !== null) {
      return;
    }

    const startedGame = await startGameMutation.mutateAsync();

    startedGameRef.current = startedGame;
  };

  const handleGameComplete = (result: GameResult): void => {
    // 서버 요청이 실패해도 같은 결과로 재시도할 수 있도록 먼저 보관한다.
    setGameResult(result);
    completeGameMutation.mutate(result);
  };

  const handleSaveRetry = (): void => {
    if (gameResult === null || completeGameMutation.isPending) {
      return;
    }

    completeGameMutation.mutate(gameResult);
  };

  return (
    <section className={styles.container} aria-label="솔로 게임">
      <div className={styles.selectionSummary}>
        <strong>{selection.song.title}</strong>
        <span>
          {selection.beatmap.difficulty.toUpperCase()} · 레벨{" "}
          {selection.beatmap.level}
        </span>
      </div>

      {startGameMutation.data === undefined ? null : (
        <p className={styles.sessionStatus}>
          솔로 경기 #{startGameMutation.data.gameSession.id} · 참가 정보 #
          {startGameMutation.data.gamePlayer.id}
        </p>
      )}

      {gameResult === null ? (
        <GameCanvas
          audioUrl={selection.song.audioUrl}
          onCreateGame={ensureGameSession}
          onComplete={handleGameComplete}
        />
      ) : (
        <SoloResult
          result={gameResult}
          saveStatus={
            completeGameMutation.isPending
              ? "saving"
              : completeGameMutation.isError
                ? "error"
                : "saved"
          }
          saveError={
            completeGameMutation.isError
              ? getErrorMessage(completeGameMutation.error)
              : null
          }
          onRetry={handleSaveRetry}
        />
      )}
    </section>
  );
};
