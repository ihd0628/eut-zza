import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, logout } from "./api/auth-api";
import { AuthPanel } from "./components/AuthPanel";
import { GameCanvas } from "./components/GameCanvas";
import { currentUserQueryKey } from "./query/query-keys";
import styles from "./App.module.css";

function App() {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: getCurrentUser,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
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

      <GameCanvas />
    </main>
  );
}

export default App;
