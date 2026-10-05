import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { getMultiplayerResult } from "../api/game-session-api";
import {
  returnRoomToLobby,
  type MultiplayerResultStatus,
} from "../api/room-api";
import {
  multiplayerResultQueryKey,
  roomQueryKey,
} from "../query/query-keys";
import type { RoomContext } from "./RoomBoundary";
import styles from "./MultiplayerResultPage.module.css";

const getDnfLabel = (status: MultiplayerResultStatus): string => {
  if (status === "disconnected") return "연결 종료";
  if (status === "timed_out") return "제출 시간 초과";
  return "미완주";
};

export const MultiplayerResultPage = () => {
  const { room, user } = useOutletContext<RoomContext>();
  const { gameSessionId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const game = room.currentGame?.gameSessionId === gameSessionId
    ? room.currentGame
    : null;
  const resultQuery = useQuery({
    queryKey: multiplayerResultQueryKey(gameSessionId),
    queryFn: () => {
      if (gameSessionId === "") throw new Error("경기 정보가 없습니다.");
      return getMultiplayerResult(gameSessionId);
    },
    enabled: gameSessionId !== "",
    initialData: game?.results === null || game === null
      ? undefined
      : {
          gameSessionId: game.gameSessionId,
          status: "completed" as const,
          players: game.results,
        },
  });
  const returnMutation = useMutation({
    mutationFn: () => returnRoomToLobby(room.id, gameSessionId),
    onSuccess: (updatedRoom) => {
      queryClient.setQueryData(roomQueryKey(room.id), updatedRoom);
      void navigate(`/multiplayer/rooms/${room.id}`, { replace: true });
    },
  });

  if (resultQuery.isPending) return <p>최종 순위를 불러오고 있습니다.</p>;
  if (resultQuery.isError) {
    return <p role="alert">최종 순위를 불러오지 못했습니다: {resultQuery.error.message}</p>;
  }

  return (
    <section className={styles.container} aria-labelledby="multiplayer-result-title">
      <p className={styles.eyebrow}>MULTIPLAYER RESULT</p>
      <h1 id="multiplayer-result-title">경기 #{gameSessionId} 최종 결과</h1>
      <ol className={styles.ranking}>
        {resultQuery.data.players.map((player) => (
          <li
            className={player.userId === user.id ? styles.me : undefined}
            key={player.gamePlayerId}
          >
            <strong>
              {player.rank === null ? "DNF" : `${player.rank}위`}
            </strong>
            <span>{player.userId === user.id ? "나" : player.email}</span>
            <span>
              {player.score === null
                ? getDnfLabel(player.resultStatus)
                : `${player.score.toLocaleString("ko-KR")}점`}
            </span>
            <span>
              {player.maxCombo === null ? "-" : `MAX COMBO ${player.maxCombo}`}
            </span>
            {player.isWinner ? <span className={styles.winner}>우승</span> : null}
          </li>
        ))}
      </ol>
      <p>같은 점수는 같은 순위이며, 공동 1등은 모두 우승자입니다.</p>
      {returnMutation.isError ? (
        <p className={styles.error} role="alert">대기실로 돌아가지 못했습니다: {returnMutation.error.message}</p>
      ) : null}
      <nav className={styles.actions} aria-label="멀티플레이 결과 이동">
        <button
          className={styles.returnButton}
          type="button"
          disabled={returnMutation.isPending}
          onClick={() => returnMutation.mutate()}
        >
          {returnMutation.isPending ? "대기실로 돌아가는 중..." : "방 대기실로 돌아가기"}
        </button>
        <Link to="/multiplayer/rooms">방 나가기</Link>
      </nav>
    </section>
  );
};
