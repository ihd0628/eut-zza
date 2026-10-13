import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useOutletContext } from "react-router";
import type { User } from "../api/auth-api";
import {
  cancelMatchmaking,
  getMatchmakingStatus,
  joinMatchmaking,
} from "../api/matchmaking-api";
import { createRoom, getRooms, joinRoom, type Room } from "../api/room-api";
import { matchmakingQueryKey, roomsQueryKey } from "../query/query-keys";
import styles from "./RoomListPage.module.css";

export const RoomListPage = () => {
  const user = useOutletContext<User>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const roomsQuery = useQuery({
    queryKey: roomsQueryKey,
    queryFn: getRooms,
    refetchInterval: 5_000,
  });
  const matchmakingQuery = useQuery({
    queryKey: matchmakingQueryKey,
    queryFn: getMatchmakingStatus,
    refetchInterval: (query) =>
      query.state.data?.state === "waiting" ? 1_000 : false,
  });
  const enterMutation = useMutation({
    mutationFn: (roomId?: string) =>
      roomId === undefined ? createRoom() : joinRoom(roomId),
    onSuccess: (room: Room) => {
      void queryClient.invalidateQueries({
        queryKey: roomsQueryKey,
        exact: true,
      });
      void navigate(`/multiplayer/rooms/${room.id}`);
    },
  });
  const joinMatchmakingMutation = useMutation({
    mutationFn: joinMatchmaking,
    onSuccess: (status) => {
      queryClient.setQueryData(matchmakingQueryKey, status);
    },
  });
  const cancelMatchmakingMutation = useMutation({
    mutationFn: cancelMatchmaking,
    onSuccess: (status) => {
      queryClient.setQueryData(matchmakingQueryKey, status);
    },
  });

  const matchmaking = matchmakingQuery.data;
  useEffect(() => {
    if (matchmaking?.state === "matched") {
      void navigate(`/multiplayer/rooms/${matchmaking.roomId}`, {
        replace: true,
      });
    }
  }, [matchmaking, navigate]);

  const myRoom = roomsQuery.data?.find((room) =>
    room.participants.some((participant) => participant.userId === user.id),
  );
  const isWaitingForMatch = matchmaking?.state === "waiting";
  const isMatchmakingPending =
    matchmakingQuery.isPending ||
    joinMatchmakingMutation.isPending ||
    cancelMatchmakingMutation.isPending;

  return (
    <section className={styles.container} aria-labelledby="room-list-title">
      <nav className={styles.navigation}>
        <Link to="/">← 모드 선택으로</Link>
      </nav>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MULTIPLAYER</p>
          <h1 id="room-list-title">BATTLE LOBBY</h1>
          <p>방을 만들거나 입장해 최대 4명이 함께 플레이할 수 있습니다.</p>
        </div>
        <button
          type="button"
          disabled={
            enterMutation.isPending || myRoom !== undefined || isWaitingForMatch
          }
          onClick={() => enterMutation.mutate(undefined)}
        >
          방 만들기
        </button>
      </header>

      <section
        className={styles.matchmaking}
        aria-labelledby="matchmaking-title"
      >
        <div>
          <p className={styles.eyebrow}>AUTO MATCH</p>
          <h2 id="matchmaking-title">자동 매칭</h2>
          <p>
            {isWaitingForMatch
              ? `${matchmaking.waitingPlayers}명이 대기 중입니다. 4명이 모이거나 잠시 기다리면 2~4명으로 방을 만듭니다.`
              : "대기열에서 2~4명의 참가자를 찾아 같은 방으로 이동합니다."}
          </p>
        </div>
        {isWaitingForMatch ? (
          <button
            type="button"
            disabled={isMatchmakingPending}
            onClick={() => cancelMatchmakingMutation.mutate()}
          >
            매칭 취소
          </button>
        ) : (
          <button
            type="button"
            disabled={isMatchmakingPending || myRoom !== undefined}
            onClick={() => joinMatchmakingMutation.mutate()}
          >
            자동 매칭 시작
          </button>
        )}
      </section>

      {enterMutation.isError ? (
        <p role="alert" className={styles.error}>
          {enterMutation.error.message}
        </p>
      ) : null}
      {matchmakingQuery.isError ? (
        <p role="alert" className={styles.error}>
          {matchmakingQuery.error.message}
        </p>
      ) : null}
      {joinMatchmakingMutation.isError ? (
        <p role="alert" className={styles.error}>
          {joinMatchmakingMutation.error.message}
        </p>
      ) : null}
      {cancelMatchmakingMutation.isError ? (
        <p role="alert" className={styles.error}>
          {cancelMatchmakingMutation.error.message}
        </p>
      ) : null}
      {myRoom !== undefined ? (
        <p>
          이미 참가한 방이 있습니다.{" "}
          <Link to={`/multiplayer/rooms/${myRoom.id}`}>방으로 돌아가기</Link>
        </p>
      ) : null}
      {roomsQuery.isPending ? <p>방 목록을 불러오고 있습니다.</p> : null}
      {roomsQuery.isError ? (
        <p role="alert" className={styles.error}>
          {roomsQuery.error.message}
        </p>
      ) : null}
      {roomsQuery.data?.length === 0 ? (
        <p>아직 방이 없습니다. 첫 방을 만들어 보세요.</p>
      ) : null}
      <div className={styles.listHeading}>
        <span>ROOM / 참가할 방 선택</span>
        <span>최대 4인 대전</span>
      </div>
      <ul className={styles.rooms}>
        {roomsQuery.data?.map((room) => (
          <li key={room.id} className={styles.room}>
            <div>
              <strong>방 #{room.id.slice(0, 8)}</strong>
              <p>
                {room.status === "waiting"
                  ? "대기 중"
                  : room.status === "starting"
                    ? "시작 중"
                    : room.status === "playing"
                      ? "진행 중"
                      : "경기 종료"}{" "}
                · {room.participants.length}/4명
              </p>
            </div>
            {myRoom?.id === room.id ? (
              <Link to={`/multiplayer/rooms/${room.id}`}>돌아가기</Link>
            ) : (
              <button
                type="button"
                disabled={
                  enterMutation.isPending ||
                  myRoom !== undefined ||
                  isWaitingForMatch ||
                  room.status !== "waiting" ||
                  room.participants.length >= 4
                }
                onClick={() => enterMutation.mutate(room.id)}
              >
                입장
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
