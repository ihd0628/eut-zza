import { useNavigate } from "react-router";
import { SoloSetup } from "../components/SoloSetup";
import { PageNavigation } from "./PageNavigation";

export const SoloSetupPage = () => {
  const navigate = useNavigate();
  return (
    <>
      <PageNavigation label="솔로 플레이 이동" links={[{ to: "/", text: "← 모드 선택으로" }]} />
      <SoloSetup onStart={({ beatmap }) => void navigate(`/solo/play/${beatmap.id}`)} />
    </>
  );
};
