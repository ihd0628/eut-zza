import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { getSongs } from "../api/song-api";
import { SoloGame } from "../components/SoloGame";
import { songsQueryKey } from "../query/query-keys";
import { PageNavigation } from "./PageNavigation";

export const SoloGamePage = () => {
  const { beatmapId } = useParams();
  const navigate = useNavigate();
  const songsQuery = useQuery({ queryKey: songsQueryKey, queryFn: getSongs });
  if (songsQuery.isPending) return <p>곡 정보를 불러오고 있습니다.</p>;
  if (songsQuery.isError) return <p role="alert">{songsQuery.error.message}</p>;

  const song = songsQuery.data.find((item) => item.beatmaps.some((beatmap) => beatmap.id === beatmapId));
  const beatmap = song?.beatmaps.find((item) => item.id === beatmapId);
  if (song === undefined || beatmap === undefined) {
    return <p role="alert">채보를 찾을 수 없습니다. <Link to="/solo">곡 선택으로</Link></p>;
  }

  return (
    <>
      <PageNavigation label="솔로 플레이 이동" links={[{ to: "/solo", text: "← 곡 선택으로" }]} />
      <SoloGame
        selection={{ song, beatmap }}
        onSaved={(gameSessionId) => void navigate(`/solo/results/${gameSessionId}`, { replace: true })}
      />
    </>
  );
};
