import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useBlocker,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router";
import type { User } from "../api/auth-api";
import { getWebSocketUrl, HttpError } from "../api/http";
import {
  getRoom,
  leaveRoom,
  type Room,
  type RoomGamePlayer,
} from "../api/room-api";
import { AudioManager } from "../game/AudioManager";
import { roomQueryKey, roomsQueryKey } from "../query/query-keys";
import styles from "./RoomBoundary.module.css";

export type RoomContext = {
  room: Room;
  user: User;
  clockOffsetMs: number;
  clockSynchronized: boolean;
  prepareAudio: (
    beatmapId: string,
    audioUrl: string,
  ) => Promise<AudioManager>;
  getPreparedAudioManager: (beatmapId: string) => AudioManager | null;
  sendRoomMessage: (message: unknown) => boolean;
};

type PreparedAudio = {
  beatmapId: string;
  audioUrl: string;
  audioManager: AudioManager;
  preparation: Promise<AudioManager>;
};

export const RoomBoundary = () => {
  const { roomId = "" } = useParams();
  const user = useOutletContext<User>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [clockSynchronized, setClockSynchronized] = useState(false);
  const isLeaving = useRef(false);
  const preparedAudioRef = useRef<PreparedAudio | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const roomQuery = useQuery({
    queryKey: roomQueryKey(roomId),
    queryFn: () => getRoom(roomId),
    enabled: roomId !== "",
    retry: false,
  });
  const isRoomLoaded = roomQuery.data !== undefined;
  const roomPath = `/multiplayer/rooms/${roomId}`;

  const prepareAudio = useCallback(async (
    beatmapId: string,
    audioUrl: string,
  ): Promise<AudioManager> => {
    const current = preparedAudioRef.current;
    if (current?.beatmapId === beatmapId && current.audioUrl === audioUrl) {
      return current.preparation;
    }

    // 이미 사용자 클릭으로 활성화한 AudioContext가 있다면 채보 변경 때도 재사용한다.
    // 새 Context를 Effect에서 만들면 브라우저의 자동 재생 정책에 다시 막힐 수 있다.
    const audioManager = current?.audioManager ?? new AudioManager();
    const preparation = audioManager.prepare(audioUrl).then(() => audioManager);
    preparedAudioRef.current = { beatmapId, audioUrl, audioManager, preparation };

    try {
      return await preparation;
    } catch (error: unknown) {
      if (preparedAudioRef.current?.preparation === preparation) {
        preparedAudioRef.current = current;
      }
      if (current === null) {
        await audioManager.close();
      }
      throw error;
    }
  }, []);

  const getPreparedAudioManager = useCallback((beatmapId: string): AudioManager | null => {
    const preparedAudio = preparedAudioRef.current;
    return preparedAudio?.beatmapId === beatmapId
      ? preparedAudio.audioManager
      : null;
  }, []);

  const sendRoomMessage = useCallback((message: unknown): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

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
    let timeSyncTimers: number[] = [];
    let bestRoundTripMs = Number.POSITIVE_INFINITY;

    const clearTimeSyncTimers = () => {
      for (const timer of timeSyncTimers) window.clearTimeout(timer);
      timeSyncTimers = [];
    };

    const connect = () => {
      if (disposed) return;
      const nextSocket = new WebSocket(getWebSocketUrl(`/ws/rooms/${roomId}`));
      socket = nextSocket;
      socketRef.current = nextSocket;
      nextSocket.addEventListener("open", () => {
        // 연결이 끊긴 동안 놓친 방 변경을 서버의 최신 상태로 보정한다.
        // 첫 연결에도 실행해 최초 HTTP 조회와 소켓 연결 사이의 틈을 메운다.
        void queryClient.invalidateQueries({ queryKey: roomQueryKey(roomId), exact: true });

        // 여러 표본 중 왕복 시간이 가장 짧은 응답이 큐 대기와 지연의 영향을
        // 비교적 적게 받으므로 그 표본으로 서버-브라우저 시계 차이를 계산한다.
        bestRoundTripMs = Number.POSITIVE_INFINITY;
        setClockSynchronized(false);
        clearTimeSyncTimers();
        timeSyncTimers = [0, 150, 300].map((delayMs) => window.setTimeout(() => {
          if (nextSocket.readyState === WebSocket.OPEN) {
            nextSocket.send(JSON.stringify({ type: "time_sync", clientSentAtMs: Date.now() }));
          }
        }, delayMs));
      });
      nextSocket.addEventListener("message", (event: MessageEvent<string>) => {
        try {
          const message = JSON.parse(event.data) as
            | { type: "room_updated"; room: Room }
            | { type: "room_deleted"; roomId: string }
            | {
                type: "game_progress";
                gameSessionId: string;
                player: RoomGamePlayer;
              }
            | { type: "time_sync"; clientSentAtMs: number; serverTimeMs: number };
          if (message.type === "room_updated" && message.room.id === roomId) {
            queryClient.setQueryData(roomQueryKey(roomId), message.room);
            void queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true });
          } else if (message.type === "room_deleted" && message.roomId === roomId) {
            void queryClient.invalidateQueries({ queryKey: roomsQueryKey, exact: true });
            void navigate("/multiplayer/rooms", { replace: true });
          } else if (message.type === "game_progress") {
            queryClient.setQueryData<Room>(roomQueryKey(roomId), (currentRoom) => {
              if (
                currentRoom?.currentGame?.gameSessionId !== message.gameSessionId
              ) {
                return currentRoom;
              }

              return {
                ...currentRoom,
                currentGame: {
                  ...currentRoom.currentGame,
                  players: currentRoom.currentGame.players.map((player) =>
                    player.gamePlayerId === message.player.gamePlayerId
                      ? message.player
                      : player),
                },
              };
            });
          } else if (message.type === "time_sync") {
            const clientReceivedAtMs = Date.now();
            const roundTripMs = clientReceivedAtMs - message.clientSentAtMs;

            if (roundTripMs >= 0 && roundTripMs < bestRoundTripMs) {
              bestRoundTripMs = roundTripMs;
              const clientMidpointMs =
                (message.clientSentAtMs + clientReceivedAtMs) / 2;
              setClockOffsetMs(message.serverTimeMs - clientMidpointMs);
              setClockSynchronized(true);
            }
          }
        } catch { /* 다른 형식의 메시지는 무시한다. */ }
      });
      nextSocket.addEventListener("close", () => {
        clearTimeSyncTimers();
        if (socketRef.current === nextSocket) socketRef.current = null;
        if (!disposed && socket === nextSocket) {
          setClockSynchronized(false);
          reconnectTimer = window.setTimeout(connect, 1_000);
        }
      });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeSyncTimers();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, [roomId, isRoomLoaded, queryClient, navigate]);

  useEffect(() => {
    if (roomQuery.data?.currentGame != null) {
      const targetPath = roomQuery.data?.status === "finished"
        ? `${roomPath}/results/${roomQuery.data.currentGame.gameSessionId}`
        : roomQuery.data?.status === "playing"
          ? `${roomPath}/play`
          : null;

      if (targetPath !== null && location.pathname !== targetPath) {
        void navigate(targetPath, { replace: true });
      }
    }
  }, [location.pathname, navigate, roomPath, roomQuery.data]);

  useEffect(() => () => {
    const preparedAudio = preparedAudioRef.current;
    preparedAudioRef.current = null;
    if (preparedAudio !== null) void preparedAudio.audioManager.close();
  }, []);

  if (roomQuery.isPending) return <p>방 정보를 불러오고 있습니다.</p>;
  if (roomQuery.isError) {
    return <p role="alert">방에 들어갈 수 없습니다: {roomQuery.error.message} <Link to="/multiplayer/rooms">방 목록으로</Link></p>;
  }

  return (
    <>
      {leaveError !== null ? <p className={styles.error} role="alert">{leaveError}</p> : null}
      <Outlet
        context={{
          room: roomQuery.data,
          user,
          clockOffsetMs,
          clockSynchronized,
          prepareAudio,
          getPreparedAudioManager,
          sendRoomMessage,
        } satisfies RoomContext}
      />
    </>
  );
};
