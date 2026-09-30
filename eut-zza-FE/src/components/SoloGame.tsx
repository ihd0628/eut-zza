import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  startSoloGame,
  type StartedSoloGame,
} from "../api/game-session-api";
import type { GameResult } from "../game/types";
import type { SoloGameSelection } from "./SoloSetup";
import { GameCanvas } from "./GameCanvas";
import { SoloResult } from "./SoloResult";
import styles from "./SoloGame.module.css";

type SoloGameProps = {
  selection: SoloGameSelection;
};

/**
 * 선택한 채보로 서버의 솔로 경기를 만들고 GameCanvas를 연결한다.
 *
 * 서버가 반환한 gamePlayerId는 이후 최종 점수를 제출할 때 사용한다.
 * 같은 화면에서 음원 준비를 재시도하더라도 경기를 중복 생성하지 않도록
 * 성공한 결과를 ref에도 보관한다.
 */
export const SoloGame = ({ selection }: SoloGameProps) => {
  const startedGameRef = useRef<StartedSoloGame | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const startGameMutation = useMutation({
    mutationFn: () => startSoloGame(selection.beatmap.id),
  });

  const ensureGameSession = async (): Promise<void> => {
    if (startedGameRef.current !== null) {
      return;
    }

    const startedGame = await startGameMutation.mutateAsync();

    startedGameRef.current = startedGame;
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
          onComplete={setGameResult}
        />
      ) : (
        <SoloResult result={gameResult} />
      )}
    </section>
  );
};
