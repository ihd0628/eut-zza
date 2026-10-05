import { createBrowserRouter, Navigate } from "react-router";
import { AuthPanel } from "./components/AuthPanel";
import { AppLayout } from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import { ModeSelectionPage } from "./pages/ModeSelectionPage";
import { MultiplayerGamePage } from "./pages/MultiplayerGamePage";
import { RecordsPage } from "./pages/RecordsPage";
import { RoomBoundary } from "./pages/RoomBoundary";
import { RoomListPage } from "./pages/RoomListPage";
import { RoomLobbyPage } from "./pages/RoomLobbyPage";
import { SoloGamePage } from "./pages/SoloGamePage";
import { SoloResultPage } from "./pages/SoloResultPage";
import { SoloSetupPage } from "./pages/SoloSetupPage";

// URL이 화면 상태를 나타내므로 뒤로가기와 새로고침에도 같은 화면을 복원한다.
export const router = createBrowserRouter([
  { path: "/login", element: <AuthPanel mode="login" /> },
  { path: "/signup", element: <AuthPanel mode="signup" /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <ModeSelectionPage /> },
          { path: "/records", element: <RecordsPage /> },
          { path: "/solo", element: <SoloSetupPage /> },
          { path: "/solo/play/:beatmapId", element: <SoloGamePage /> },
          { path: "/solo/results/:gameSessionId", element: <SoloResultPage /> },
          { path: "/multiplayer/rooms", element: <RoomListPage /> },
          {
            path: "/multiplayer/rooms/:roomId",
            element: <RoomBoundary />,
            children: [
              { index: true, element: <RoomLobbyPage /> },
              { path: "play", element: <MultiplayerGamePage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
