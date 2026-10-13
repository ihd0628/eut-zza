import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router";
import { submitMultiplayerResult } from "../api/game-session-api";
import { getSongs } from "../api/song-api";
import { GameCanvas } from "../components/GameCanvas";
import type { AudioManager } from "../game/AudioManager";
import type { GameProgress, GameResult } from "../game/types";
import {
  myBestScoresQueryKey,
  myScoresQueryKey,
  songsQueryKey,
} from "../query/query-keys";
import type { RoomContext } from "./RoomBoundary";
import styles from "./MultiplayerGamePage.module.css";

const PROGRESS_SEND_INTERVAL_MS = 250;

export const MultiplayerGamePage = () => {
  const {
    room,
    user,
    clockOffsetMs,
    clockSynchronized,
    prepareAudio,
    getPreparedAudioManager,
    sendRoomMessage,
  } = useOutletContext<RoomContext>();
  const queryClient = useQueryClient();
  const game = room.currentGame;
  const me = game?.players.find((player) => player.userId === user.id);
  const songsQuery = useQuery({ queryKey: songsQueryKey, queryFn: getSongs });
  const selectedSong = songsQuery.data?.find((song) =>
    song.beatmaps.some((beatmap) => beatmap.id === game?.beatmapId),
  );
  const selectedBeatmap = selectedSong?.beatmaps.find(
    (beatmap) => beatmap.id === game?.beatmapId,
  );
  const [audioManager, setAudioManager] = useState<AudioManager | null>(() =>
    game === null ? null : getPreparedAudioManager(game.beatmapId),
  );
  const [result, setResult] = useState<GameResult | null>(null);
  const latestProgressRef = useRef<GameProgress>({ score: 0, combo: 0 });
  const lastProgressSentAtRef = useRef(0);
  const progressTimerRef = useRef<number | null>(null);
  const prepareMutation = useMutation({
    mutationFn: async () => {
      if (game === null || selectedSong === undefined) {
        throw new Error("경기 음원 정보를 찾을 수 없습니다.");
      }

      return prepareAudio(game.beatmapId, selectedSong.audioUrl);
    },
    onSuccess: setAudioManager,
  });
  const resultMutation = useMutation({
    mutationFn: async (gameResult: GameResult) => {
      if (game === null || me === undefined) {
        throw new Error("멀티플레이 참가 정보를 찾을 수 없습니다.");
      }
      return submitMultiplayerResult(game.gameSessionId, {
        gamePlayerId: me.gamePlayerId,
        ...gameResult,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: myScoresQueryKey }),
        queryClient.invalidateQueries({ queryKey: myBestScoresQueryKey }),
      ]);
    },
  });
  const keepCreatedGame = useCallback(async (): Promise<void> => {
    // 멀티플레이 경기와 참가 정보는 방장이 시작할 때 서버에서 이미 함께 만들었다.
  }, []);
  const sendProgress = useCallback(
    (progress: GameProgress): void => {
      if (game === null) return;
      if (
        sendRoomMessage({
          type: "game_progress",
          gameSessionId: game.gameSessionId,
          score: progress.score,
          combo: progress.combo,
        })
      ) {
        lastProgressSentAtRef.current = performance.now();
      }
    },
    [game, sendRoomMessage],
  );
  const handleProgress = useCallback(
    (progress: GameProgress): void => {
      latestProgressRef.current = progress;
      const remainingMs = Math.max(
        0,
        PROGRESS_SEND_INTERVAL_MS -
          (performance.now() - lastProgressSentAtRef.current),
      );

      if (remainingMs === 0) {
        sendProgress(progress);
        return;
      }
      if (progressTimerRef.current !== null) return;

      progressTimerRef.current = window.setTimeout(() => {
        progressTimerRef.current = null;
        sendProgress(latestProgressRef.current);
      }, remainingMs);
    },
    [sendProgress],
  );
  const handleComplete = useCallback(
    (gameResult: GameResult): void => {
      if (progressTimerRef.current !== null) {
        window.clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      sendProgress(latestProgressRef.current);
      setResult(gameResult);
      resultMutation.mutate(gameResult);
    },
    [resultMutation, sendProgress],
  );

  useEffect(
    () => () => {
      if (progressTimerRef.current !== null) {
        window.clearTimeout(progressTimerRef.current);
      }
    },
    [],
  );

  if (game === null) {
    return <p role="alert">시작된 멀티플레이 경기 정보가 없습니다.</p>;
  }
  if (me === undefined) {
    return <p role="alert">이 경기의 참가 정보를 찾을 수 없습니다.</p>;
  }
  if (songsQuery.isPending) return <p>경기 음원 정보를 불러오고 있습니다.</p>;
  if (
    songsQuery.isError ||
    selectedSong === undefined ||
    selectedBeatmap === undefined
  ) {
    return <p role="alert">경기 음원 정보를 불러오지 못했습니다.</p>;
  }

  if (audioManager === null) {
    return (
      <section className={styles.container}>
        <h1>멀티플레이 경기 재접속</h1>
        <p>음원을 다시 준비하면 현재 경기 시점에 맞춰 합류합니다.</p>
        <button
          className={styles.actionButton}
          type="button"
          disabled={prepareMutation.isPending}
          onClick={() => prepareMutation.mutate()}
        >
          {prepareMutation.isPending
            ? "음원 준비 중..."
            : "음원 준비 후 경기 합류"}
        </button>
        {prepareMutation.isError ? (
          <p className={styles.error} role="alert">
            {prepareMutation.error.message}
          </p>
        ) : null}
      </section>
    );
  }

  if (!clockSynchronized) {
    return <p>서버 시각을 동기화하고 있습니다.</p>;
  }

  const startAtClientMs = game.startAtServerMs - clockOffsetMs;

  return (
    <section className={styles.container} aria-label="멀티플레이 경기">
      {result === null ? (
        <GameCanvas
          songTitle={selectedSong.title}
          difficulty={`${selectedBeatmap.difficulty.toUpperCase()} / LV.${selectedBeatmap.level}`}
          sidePanel={
            <section
              className={styles.progressPanel}
              aria-label="참가자 실시간 진행 상황"
            >
              <h2>
                LIVE RANKING <span>실시간</span>
              </h2>
              <ol className={styles.progressList}>
                {[...game.players]
                  .sort((a, b) => b.score - a.score)
                  .map((player) => (
                    <li
                      key={player.gamePlayerId}
                      className={
                        player.userId === user.id ? styles.me : undefined
                      }
                    >
                      <span className={styles.rank}>
                        {game.players.filter(
                          (other) => other.score > player.score,
                        ).length + 1}
                      </span>
                      <div>
                        <strong>
                          {player.userId === user.id
                            ? "YOU"
                            : `PLAYER ${player.userId}`}
                        </strong>
                        <span className={styles.playerScore}>
                          {player.score.toLocaleString("ko-KR")}
                        </span>
                        <small>
                          COMBO {player.combo}{" "}
                          {player.resultStatus === "playing"
                            ? ""
                            : player.resultStatus === "submitted"
                              ? " / 완주"
                              : " / DNF"}
                        </small>
                      </div>
                    </li>
                  ))}
              </ol>
              <p className={styles.liveNote}>
                진행 중 점수입니다.
                <br />
                최종 순위는 경기 종료 후 확정됩니다.
              </p>
            </section>
          }
          audioUrl={selectedSong.audioUrl}
          audioManager={audioManager}
          startAtClientMs={startAtClientMs}
          onCreateGame={keepCreatedGame}
          onProgress={handleProgress}
          onComplete={handleComplete}
        />
      ) : (
        <section className={styles.result} aria-label="내 경기 결과 제출 상태">
          <h2>내 경기 완료</h2>
          <p>점수 {result.score.toLocaleString("ko-KR")}</p>
          <p>최대 콤보 {result.maxCombo}</p>
          {resultMutation.isPending ? (
            <p>내 결과를 저장하고 있습니다.</p>
          ) : null}
          {resultMutation.isSuccess ? (
            <p>다른 참가자의 결과를 기다리고 있습니다.</p>
          ) : null}
          {resultMutation.isError ? (
            <>
              <p className={styles.error} role="alert">
                {resultMutation.error.message}
              </p>
              <button
                className={styles.actionButton}
                type="button"
                onClick={() => resultMutation.mutate(result)}
              >
                결과 저장 재시도
              </button>
            </>
          ) : null}
        </section>
      )}
    </section>
  );
};
