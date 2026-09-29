import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSongs,
  type BeatmapSummary,
  type Difficulty,
  type Song,
} from "../api/song-api";
import { songsQueryKey } from "../query/query-keys";
import styles from "./SoloSetup.module.css";

export type SoloGameSelection = {
  song: Song;
  beatmap: BeatmapSummary;
};

type SoloSetupProps = {
  onStart: (selection: SoloGameSelection) => void;
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "EASY",
  normal: "NORMAL",
  hard: "HARD",
};

/**
 * 서버의 곡·채보 목록을 보여주고 솔로 게임에 사용할 항목을 선택한다.
 * 곡 목록은 서버 상태이므로 TanStack Query가 가져오고 캐시한다.
 * 현재 선택한 곡과 채보 ID는 이 화면에서만 필요한 UI 상태다.
 */
export const SoloSetup = ({ onStart }: SoloSetupProps) => {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedBeatmapId, setSelectedBeatmapId] = useState<string | null>(
    null,
  );
  const songsQuery = useQuery({
    queryKey: songsQueryKey,
    queryFn: getSongs,
  });

  if (songsQuery.isPending) {
    return <p className={styles.status}>곡 목록을 불러오고 있습니다.</p>;
  }

  if (songsQuery.isError) {
    return (
      <section className={styles.statusPanel}>
        <p className={styles.error} role="alert">
          곡 목록을 불러오지 못했습니다: {songsQuery.error.message}
        </p>
        <button
          className={styles.retryButton}
          type="button"
          onClick={() => {
            void songsQuery.refetch();
          }}
        >
          다시 시도
        </button>
      </section>
    );
  }

  if (songsQuery.data.length === 0) {
    return <p className={styles.status}>플레이할 수 있는 곡이 없습니다.</p>;
  }

  const selectedSong = songsQuery.data.find(
    (song) => song.id === selectedSongId,
  );
  const selectedBeatmap = selectedSong?.beatmaps.find(
    (beatmap) => beatmap.id === selectedBeatmapId,
  );

  return (
    <section className={styles.container} aria-labelledby="solo-setup-title">
      <header className={styles.header}>
        <p className={styles.eyebrow}>SOLO PLAY</p>
        <h1 id="solo-setup-title" className={styles.title}>
          곡과 난이도를 선택하세요.
        </h1>
      </header>

      <div className={styles.selectionSection}>
        <h2 className={styles.sectionTitle}>곡 선택</h2>
        <div className={styles.songGrid}>
          {songsQuery.data.map((song) => {
            const isSelected = song.id === selectedSongId;

            return (
              <button
                key={song.id}
                className={`${styles.songCard} ${
                  isSelected ? styles.selected : ""
                }`}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedSongId(song.id);
                  setSelectedBeatmapId(null);
                }}
              >
                <span className={styles.songLabel}>SONG</span>
                <strong className={styles.songTitle}>{song.title}</strong>
                <span>{song.beatmaps.length}개 난이도</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.selectionSection}>
        <h2 className={styles.sectionTitle}>난이도 선택</h2>
        {selectedSong === undefined ? (
          <p className={styles.guide}>먼저 곡을 선택하세요.</p>
        ) : selectedSong.beatmaps.length === 0 ? (
          <p className={styles.guide}>이 곡에는 플레이 가능한 채보가 없습니다.</p>
        ) : (
          <div className={styles.difficultyGrid}>
            {selectedSong.beatmaps.map((beatmap) => {
              const isSelected = beatmap.id === selectedBeatmapId;

              return (
                <button
                  key={beatmap.id}
                  className={`${styles.difficultyButton} ${
                    isSelected ? styles.selected : ""
                  }`}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedBeatmapId(beatmap.id)}
                >
                  <strong>{DIFFICULTY_LABELS[beatmap.difficulty]}</strong>
                  <span>레벨 {beatmap.level}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        className={styles.startButton}
        type="button"
        disabled={selectedSong === undefined || selectedBeatmap === undefined}
        onClick={() => {
          if (selectedSong !== undefined && selectedBeatmap !== undefined) {
            onStart({ song: selectedSong, beatmap: selectedBeatmap });
          }
        }}
      >
        선택한 곡으로 게임 준비
      </button>
    </section>
  );
};
