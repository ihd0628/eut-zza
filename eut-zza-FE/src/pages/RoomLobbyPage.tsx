import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router";
import { selectRoomBeatmap, setRoomReady } from "../api/room-api";
import { getSongs } from "../api/song-api";
import { roomQueryKey, songsQueryKey } from "../query/query-keys";
import type { RoomContext } from "./RoomBoundary";
import styles from "./RoomLobbyPage.module.css";

export const RoomLobbyPage = () => {
  const { room, user } = useOutletContext<RoomContext>();
  const queryClient = useQueryClient();
  const isHost = room.hostUserId === user.id;
  const me = room.participants.find((participant) => participant.userId === user.id);
  const allReady = room.participants.length > 0 && room.participants.every((participant) => participant.isReady);
  const canStart = room.selectedBeatmapId !== null && room.participants.length >= 2 && allReady;
  const songsQuery = useQuery({ queryKey: songsQueryKey, queryFn: getSongs });
  const selectionMutation = useMutation({
    mutationFn: (beatmapId: string) => selectRoomBeatmap(room.id, beatmapId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roomQueryKey(room.id), exact: true });
    },
  });
  const readyMutation = useMutation({
    mutationFn: ({ beatmapId, ready }: { beatmapId: string; ready: boolean }) =>
      setRoomReady(room.id, beatmapId, ready),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roomQueryKey(room.id), exact: true });
    },
  });
  const selectedSong = songsQuery.data?.find((song) =>
    song.beatmaps.some((beatmap) => beatmap.id === room.selectedBeatmapId));
  const selectedBeatmap = selectedSong?.beatmaps.find((beatmap) =>
    beatmap.id === room.selectedBeatmapId);

  return (
    <section className={styles.container} aria-labelledby="room-title">
      <nav><Link to="/multiplayer/rooms">← 방 나가기</Link></nav>
      <p className={styles.eyebrow}>MULTIPLAYER ROOM</p>
      <h1 id="room-title">방 #{room.id.slice(0, 8)}</h1>
      <p>참가 인원 {room.participants.length}/4명 · {room.status === "waiting" ? "대기 중" : "진행 중"}</p>

      <section className={styles.selection} aria-labelledby="selection-title">
        <h2 id="selection-title">곡·난이도</h2>
        <p>
          {room.selectedBeatmapId === null
            ? "아직 선택된 채보가 없습니다."
            : selectedSong !== undefined && selectedBeatmap !== undefined
              ? `${selectedSong.title} · ${selectedBeatmap.difficulty.toUpperCase()} · 레벨 ${selectedBeatmap.level}`
              : `선택된 채보 #${room.selectedBeatmapId}`}
        </p>
        {isHost ? (
          <label className={styles.selectLabel}>
            방장 채보 선택
            <select
              className={styles.select}
              value={room.selectedBeatmapId ?? ""}
              disabled={allReady || room.status !== "waiting" || songsQuery.isPending || songsQuery.isError || selectionMutation.isPending}
              onChange={(event) => {
                if (event.target.value !== "") selectionMutation.mutate(event.target.value);
              }}
            >
              <option value="" disabled>곡과 난이도를 선택하세요</option>
              {songsQuery.data?.map((song) => (
                <optgroup key={song.id} label={song.title}>
                  {song.beatmaps.map((beatmap) => (
                    <option key={beatmap.id} value={beatmap.id}>
                      {beatmap.difficulty.toUpperCase()} · 레벨 {beatmap.level}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}
        {allReady ? <p className={styles.note}>전원이 준비해 방장이 채보를 변경할 수 없습니다.</p> : null}
        {songsQuery.isError ? <p className={styles.error} role="alert">곡 목록을 불러오지 못했습니다: {songsQuery.error.message}</p> : null}
        {selectionMutation.isError ? <p className={styles.error} role="alert">{selectionMutation.error.message}</p> : null}
      </section>

      <section className={styles.readySection} aria-labelledby="ready-title">
        <h2 id="ready-title">참가자 준비 상태</h2>
        <ol className={styles.participants}>
          {room.participants.map((participant) => (
            <li key={participant.userId}>
              <strong>{participant.userId === user.id ? "나" : `플레이어 ${participant.userId}`}</strong>
              {participant.userId === room.hostUserId ? <span className={styles.host}>방장</span> : null}
              <span>{participant.isReady ? "준비 완료" : "준비 전"}</span>
            </li>
          ))}
        </ol>
        <button
          className={styles.readyButton}
          type="button"
          disabled={room.status !== "waiting" || room.selectedBeatmapId === null || me === undefined || readyMutation.isPending || selectionMutation.isPending}
          onClick={() => {
            if (room.selectedBeatmapId !== null && me !== undefined) {
              readyMutation.mutate({ beatmapId: room.selectedBeatmapId, ready: !me.isReady });
            }
          }}
        >
          {readyMutation.isPending ? "처리 중..." : me?.isReady ? "준비 취소" : "준비 완료"}
        </button>
        {readyMutation.isError ? <p className={styles.error} role="alert">{readyMutation.error.message}</p> : null}
        <p className={styles.note}>
          {canStart
            ? "전원이 준비했습니다. 게임 시작 기능은 다음 단계에서 연결합니다."
            : room.selectedBeatmapId === null
              ? "방장이 채보를 선택하면 준비할 수 있습니다."
              : room.participants.length < 2
                ? "시작하려면 참가자가 최소 2명 필요합니다."
                : "모든 참가자가 준비하면 시작할 수 있습니다."}
        </p>
      </section>
      <p className={styles.note}>새로고침 후에도 같은 방으로 돌아옵니다. 화면을 벗어나면 퇴장합니다.</p>
    </section>
  );
};
