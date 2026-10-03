import { useNavigate } from "react-router";
import { ModeSelection } from "../components/ModeSelection";

export const ModeSelectionPage = () => {
  const navigate = useNavigate();
  return (
    <ModeSelection
      onSelect={(mode) => void navigate(mode === "solo" ? "/solo" : "/multiplayer/rooms")}
      onShowRecords={() => void navigate("/records")}
    />
  );
};
