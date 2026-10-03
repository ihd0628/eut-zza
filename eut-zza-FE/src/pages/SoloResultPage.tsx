import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { getSoloResult } from "../api/game-session-api";
import { SoloResult } from "../components/SoloResult";
import { soloResultQueryKey } from "../query/query-keys";
import { PageNavigation } from "./PageNavigation";

export const SoloResultPage = () => {
  const { gameSessionId } = useParams();
  const resultQuery = useQuery({
    queryKey: soloResultQueryKey(gameSessionId ?? ""),
    queryFn: () => getSoloResult(gameSessionId ?? ""),
    enabled: gameSessionId !== undefined,
    retry: false,
  });
  if (resultQuery.isPending) return <p>저장된 결과를 불러오고 있습니다.</p>;
  if (resultQuery.isError) return <p role="alert">{resultQuery.error.message}</p>;

  return (
    <>
      <PageNavigation label="솔로 결과 이동" links={[
        { to: "/solo", text: "← 곡 선택으로" },
        { to: "/records", text: "내 기록 보기" },
      ]} />
      <SoloResult result={resultQuery.data.score} saveStatus="saved" saveError={null} onRetry={() => {}} />
    </>
  );
};
