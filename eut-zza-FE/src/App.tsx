import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, logout } from "./api/auth-api";
import { AuthPanel } from "./components/AuthPanel";
import {
  ModeSelection,
  type PlayMode,
} from "./components/ModeSelection";
import { SoloGame } from "./components/SoloGame";
import {
  SoloSetup,
  type SoloGameSelection,
} from "./components/SoloSetup";
import { currentUserQueryKey } from "./query/query-keys";
import styles from "./App.module.css";

function App() {
  const queryClient = useQueryClient();
  const [selectedMode, setSelectedMode] = useState<PlayMode | null>(null);
  const [soloGameSelection, setSoloGameSelection] =
    useState<SoloGameSelection | null>(null);
  const currentUserQuery = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: getCurrentUser,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setSelectedMode(null);
      setSoloGameSelection(null);
      queryClient.setQueryData(currentUserQueryKey, null);
    },
  });

  if (currentUserQuery.isPending) {
    return (
      <p className={styles.statusMessage}>로그인 상태를 확인하고 있습니다.</p>
    );
  }

  if (currentUserQuery.isError) {
    return (
      <section className={styles.statusPanel}>
        <h1 className={styles.statusTitle}>서버에 연결할 수 없습니다.</h1>
        <p>{currentUserQuery.error.message}</p>
        <button
          className={styles.actionButton}
          type="button"
          onClick={() => {
            void currentUserQuery.refetch();
          }}
        >
          다시 시도
        </button>
      </section>
    );
  }

  if (currentUserQuery.data === null) {
    return <AuthPanel />;
  }

  return (
    <main className={styles.gamePage}>
      <header className={styles.gameHeader}>
        <div>
          <p className={styles.productName}>eut-zza · 읏짜</p>
          <p className={styles.signedInUser}>
            <strong>{currentUserQuery.data.email}</strong>님
          </p>
        </div>
        <button
          className={styles.actionButton}
          type="button"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          {logoutMutation.isPending ? "로그아웃 중..." : "로그아웃"}
        </button>
      </header>

      {logoutMutation.isError ? (
        <p className={styles.error} role="alert">
          {logoutMutation.error.message}
        </p>
      ) : null}

      {selectedMode === null ? (
        <ModeSelection
          onSelect={(mode) => {
            setSelectedMode(mode);
            setSoloGameSelection(null);
          }}
        />
      ) : (
        <>
          <nav className={styles.modeNavigation} aria-label="플레이 모드 이동">
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => {
                setSelectedMode(null);
                setSoloGameSelection(null);
              }}
            >
              ← 모드 선택으로
            </button>
            {selectedMode === "solo" && soloGameSelection !== null ? (
              <button
                className={styles.actionButton}
                type="button"
                onClick={() => setSoloGameSelection(null)}
              >
                곡 선택으로
              </button>
            ) : null}
          </nav>

          {selectedMode === "solo" ? (
            soloGameSelection === null ? (
              <SoloSetup onStart={setSoloGameSelection} />
            ) : (
              <SoloGame selection={soloGameSelection} />
            )
          ) : (
            <section
              className={styles.comingSoonPanel}
              aria-labelledby="multiplayer-coming-soon"
            >
              <p className={styles.comingSoonEyebrow}>MULTIPLAYER</p>
              <h1
                id="multiplayer-coming-soon"
                className={styles.comingSoonTitle}
              >
                멀티플레이를 준비하고 있습니다.
              </h1>
              <p className={styles.comingSoonDescription}>
                Week 6에서 방 목록, 최대 4명 입장, 방장 설정과 실시간 대전을
                연결합니다.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default App;
