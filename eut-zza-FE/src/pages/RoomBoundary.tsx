import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useBlocker, useNavigate, useOutletContext, useParams } from "react-router";
import type { User } from "../api/auth-api";
import { getWebSocketUrl, HttpError } from "../api/http";
import { getRoom, leaveRoom, type Room } from "../api/room-api";
import { roomQueryKey, roomsQueryKey } from "../query/query-keys";
import styles from "./RoomBoundary.module.css";

export type RoomContext = { room: Room; user: User };

export const RoomBoundary = () => {
  const { roomId = "" } = useParams();
  const user = useOutletContext<User>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const isLeaving = useRef(false);
  const roomQuery = useQuery({
    queryKey: roomQueryKey(roomId),
    queryFn: () => getRoom(roomId),
    enabled: roomId !== "",
    retry: false,
  });
  const isRoomLoaded = roomQuery.data !== undefined;
  const roomPath = `/multiplayer/rooms/${roomId}`;

  // 같은 방의 하위 화면 이동은 참가 유지. 뒤로가기·Link 등 SPA 이탈만 차단해 퇴장 요청을 기다린다.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (currentLocation.pathname === roomPath || currentLocation.pathname.startsWith(`${roomPath}/`)) &&
    !(nextLocation.pathname === roomPath || nextLocation.pathname.startsWith(`${roomPath}/`)));

  useEffect(() => {
    if (blocker.state !== "blocked" || isLeaving.current) return;
    isLeaving.current = true;
    void leaveRoom(roomId)
      .catch((error: unknown) => {
        // 다른 탭에서 먼저 퇴장하거나 재접속 유예가 만료됐으면 이동은 허용한다.
        if (error instanceof HttpError && [401, 403, 404].includes(error.status)) return;
        throw error;
      })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true });
        blocker.proceed();
      })
      .catch((error: unknown) => {
        setLeaveError(error instanceof Error ? error.message : "방에서 나가지 못했습니다.");
        blocker.reset();
      })
      .finally(() => { isLeaving.current = false; });
  }, [blocker, roomId, queryClient]);

  useEffect(() => {
    if (!isRoomLoaded) return;
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(getWebSocketUrl(`/ws/rooms/${roomId}`));
      socket.addEventListener("open", () => {
        // 연결이 끊긴 동안 놓친 방 변경을 서버의 최신 상태로 보정한다.
        // 첫 연결에도 실행해 최초 HTTP 조회와 소켓 연결 사이의 틈을 메운다.
        void queryClient.invalidateQueries({ queryKey: roomQueryKey(roomId), exact: true });
      });
      socket.addEventListener("message", (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as
            | { type: "room_updated"; room: Room }
            | { type: "room_deleted"; roomId: string };
          if (message.type === "room_updated" && message.room.id === roomId) {
            queryClient.setQueryData(roomQueryKey(roomId), message.room);
          } else if (message.type === "room_deleted" && message.roomId === roomId) {
            void navigate("/multiplayer/rooms", { replace: true });
          }
          void queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true });
        } catch { /* 다른 형식의 메시지는 무시한다. */ }
      });
      socket.addEventListener("close", () => {
        if (!disposed) reconnectTimer = window.setTimeout(connect, 1_000);
      });
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [roomId, isRoomLoaded, queryClient, navigate]);

  if (roomQuery.isPending) return <p>방 정보를 불러오고 있습니다.</p>;
  if (roomQuery.isError) {
    return <p role="alert">방에 들어갈 수 없습니다: {roomQuery.error.message} <Link to="/multiplayer/rooms">방 목록으로</Link></p>;
  }

  return (
    <>
      {leaveError !== null ? <p className={styles.error} role="alert">{leaveError}</p> : null}
      <Outlet context={{ room: roomQuery.data, user } satisfies RoomContext} />
    </>
  );
};
