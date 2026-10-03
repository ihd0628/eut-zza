import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useOutletContext } from "react-router";
import type { User } from "../api/auth-api";
import { createRoom, getRooms, joinRoom, type Room } from "../api/room-api";
import { roomsQueryKey } from "../query/query-keys";
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
  const enterMutation = useMutation({
    mutationFn: (roomId?: string) => roomId === undefined ? createRoom() : joinRoom(roomId),
    onSuccess: (room: Room) => {
      void queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true });
      void navigate(`/multiplayer/rooms/${room.id}`);
    },
  });

  const myRoom = roomsQuery.data?.find((room) =>
    room.participants.some((participant) => participant.userId === user.id));

  return (
    <section className={styles.container} aria-labelledby="room-list-title">
      <nav className={styles.navigation}><Link to="/">← 모드 선택으로</Link></nav>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MULTIPLAYER</p>
          <h1 id="room-list-title">대기 중인 방</h1>
          <p>방을 만들거나 입장해 최대 4명이 함께 플레이할 수 있습니다.</p>
        </div>
        <button
          type="button"
          disabled={enterMutation.isPending || myRoom !== undefined}
          onClick={() => enterMutation.mutate(undefined)}
        >방 만들기</button>
      </header>
      {enterMutation.isError ? <p role="alert" className={styles.error}>{enterMutation.error.message}</p> : null}
      {myRoom !== undefined ? (
        <p>이미 참가한 방이 있습니다. <Link to={`/multiplayer/rooms/${myRoom.id}`}>방으로 돌아가기</Link></p>
      ) : null}
      {roomsQuery.isPending ? <p>방 목록을 불러오고 있습니다.</p> : null}
      {roomsQuery.isError ? <p role="alert" className={styles.error}>{roomsQuery.error.message}</p> : null}
      {roomsQuery.data?.length === 0 ? <p>아직 방이 없습니다. 첫 방을 만들어 보세요.</p> : null}
      <ul className={styles.rooms}>
        {roomsQuery.data?.map((room) => (
          <li key={room.id} className={styles.room}>
            <div>
              <strong>방 #{room.id.slice(0, 8)}</strong>
              <p>{room.status === "waiting" ? "대기 중" : "진행 중"} · {room.participants.length}/4명</p>
            </div>
            {myRoom?.id === room.id ? (
              <Link to={`/multiplayer/rooms/${room.id}`}>돌아가기</Link>
            ) : (
              <button
                type="button"
                disabled={enterMutation.isPending || myRoom !== undefined || room.status !== "waiting" || room.participants.length >= 4}
                onClick={() => enterMutation.mutate(room.id)}
              >입장</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
