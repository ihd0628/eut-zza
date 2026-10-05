import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router";
import { getSongs } from "../api/song-api";
import { GameCanvas } from "../components/GameCanvas";
import type { AudioManager } from "../game/AudioManager";
import type { GameResult } from "../game/types";
import { songsQueryKey } from "../query/query-keys";
import type { RoomContext } from "./RoomBoundary";
import styles from "./MultiplayerGamePage.module.css";

export const MultiplayerGamePage = () => {
  const {
    room,
    user,
    clockOffsetMs,
    clockSynchronized,
    prepareAudio,
    getPreparedAudioManager,
  } = useOutletContext<RoomContext>();
  const game = room.currentGame;
  const songsQuery = useQuery({ queryKey: songsQueryKey, queryFn: getSongs });
  const selectedSong = songsQuery.data?.find((song) =>
    song.beatmaps.some((beatmap) => beatmap.id === game?.beatmapId));
  const selectedBeatmap = selectedSong?.beatmaps.find((beatmap) =>
    beatmap.id === game?.beatmapId);
  const [audioManager, setAudioManager] = useState<AudioManager | null>(() =>
    game === null ? null : getPreparedAudioManager(game.beatmapId));
  const [result, setResult] = useState<GameResult | null>(null);
  const prepareMutation = useMutation({
    mutationFn: async () => {
      if (game === null || selectedSong === undefined) {
        throw new Error("경기 음원 정보를 찾을 수 없습니다.");
      }

      return prepareAudio(game.beatmapId, selectedSong.audioUrl);
    },
    onSuccess: setAudioManager,
  });
  const keepCreatedGame = useCallback(async (): Promise<void> => {
    // 멀티플레이 경기와 참가 정보는 방장이 시작할 때 서버에서 이미 함께 만들었다.
  }, []);
  const handleComplete = useCallback((gameResult: GameResult): void => {
    // 참가자별 결과 수집은 Week 6의 다음 단계에서 서버와 연결한다.
    setResult(gameResult);
  }, []);

  if (game === null) {
    return <p role="alert">시작된 멀티플레이 경기 정보가 없습니다.</p>;
  }

  const me = game.players.find((player) => player.userId === user.id);
  if (me === undefined) {
    return <p role="alert">이 경기의 참가 정보를 찾을 수 없습니다.</p>;
  }

  if (songsQuery.isPending) return <p>경기 음원 정보를 불러오고 있습니다.</p>;
  if (songsQuery.isError || selectedSong === undefined || selectedBeatmap === undefined) {
    return <p role="alert">경기 음원 정보를 불러오지 못했습니다.</p>;
  }

  if (audioManager === null) {
    return (
      <section className={styles.container}>
        <h1>멀티플레이 경기 재접속</h1>
        <p>새로고침으로 브라우저의 AudioBuffer가 사라졌습니다.</p>
        <button
          className={styles.actionButton}
          type="button"
          disabled={prepareMutation.isPending}
          onClick={() => prepareMutation.mutate()}
        >
          {prepareMutation.isPending ? "음원 준비 중..." : "음원 준비 후 경기 합류"}
        </button>
        {prepareMutation.isError ? (
          <p className={styles.error} role="alert">{prepareMutation.error.message}</p>
        ) : null}
      </section>
    );
  }

  if (!clockSynchronized) {
    return <p>서버 시각을 동기화하고 있습니다.</p>;
  }

  const startAtClientMs = game.startAtServerMs - clockOffsetMs;

  return (
    <section className={styles.container} aria-labelledby="multiplayer-game-title">
      <p className={styles.eyebrow}>MULTIPLAYER</p>
      <h1 id="multiplayer-game-title">{selectedSong.title}</h1>
      <p>
        {selectedBeatmap.difficulty.toUpperCase()} · 경기 #{game.gameSessionId} ·
        내 참가 정보 #{me.gamePlayerId}
      </p>
      {result === null ? (
        <GameCanvas
          audioUrl={selectedSong.audioUrl}
          audioManager={audioManager}
          startAtClientMs={startAtClientMs}
          onCreateGame={keepCreatedGame}
          onComplete={handleComplete}
        />
      ) : (
        <section className={styles.result} aria-label="내 임시 경기 결과">
          <h2>내 경기 완료</h2>
          <p>점수 {result.score.toLocaleString()}</p>
          <p>최대 콤보 {result.maxCombo}</p>
          <p>다음 단계에서 참가자 전체 결과 수집과 순위를 연결합니다.</p>
        </section>
      )}
    </section>
  );
};
