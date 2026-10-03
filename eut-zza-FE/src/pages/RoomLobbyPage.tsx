import { Link, useOutletContext } from "react-router";
import type { RoomContext } from "./RoomBoundary";
import styles from "./RoomLobbyPage.module.css";

export const RoomLobbyPage = () => {
  const { room, user } = useOutletContext<RoomContext>();
  const isHost = room.hostUserId === user.id;
  return (
    <section className={styles.container} aria-labelledby="room-title">
      <nav><Link to="/multiplayer/rooms">← 방 나가기</Link></nav>
      <p className={styles.eyebrow}>MULTIPLAYER ROOM</p>
      <h1 id="room-title">방 #{room.id.slice(0, 8)}</h1>
      <p>참가 인원 {room.participants.length}/4명 · {room.status === "waiting" ? "대기 중" : "진행 중"}</p>
      <ol className={styles.participants}>
        {room.participants.map((participant) => (
          <li key={participant.userId}>
            <strong>{participant.userId === user.id ? "나" : `플레이어 ${participant.userId}`}</strong>
            {participant.userId === room.hostUserId ? <span className={styles.host}>방장</span> : null}
          </li>
        ))}
      </ol>
      <p className={styles.note}>
        {isHost
          ? "방장입니다. 곡·난이도 선택과 게임 시작은 다음 단계에서 연결합니다."
          : "방장이 곡과 난이도를 선택하고 게임을 시작할 수 있습니다."}
      </p>
      <p className={styles.note}>새로고침 후에도 같은 방으로 돌아옵니다. 화면을 벗어나면 퇴장합니다.</p>
    </section>
  );
};
