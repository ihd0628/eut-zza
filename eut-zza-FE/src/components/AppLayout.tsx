import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router";
import { logout, type User } from "../api/auth-api";
import { currentUserQueryKey } from "../query/query-keys";
import styles from "./AppLayout.module.css";

export const AppLayout = () => {
  const user = useOutletContext<User>();
  const { pathname } = useLocation();
  const isPlaying =
    /^\/solo\/play\//.test(pathname) ||
    /^\/multiplayer\/rooms\/[^/]+\/play$/.test(pathname);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // 로그아웃 이후 이전 계정의 서버 상태를 다음 계정에 보여주지 않는다.
      queryClient.clear();
      queryClient.setQueryData(currentUserQueryKey, null);
      void navigate("/login", { replace: true });
    },
  });

  return (
    <main className={`${styles.page} ${isPlaying ? styles.playing : ""}`}>
      <header className={styles.header} hidden={isPlaying}>
        <div>
          <Link
            className={styles.productName}
            to="/"
            aria-label="읏짜 모드 선택"
          >
            eut-zza<span>읏짜 / RHYTHM ARCADE</span>
          </Link>
        </div>
        <p className={styles.signedInUser}>
          <span>PLAYER</span>
          <strong>{user.email}</strong>
        </p>
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
      <Outlet context={user} />
      {!isPlaying ? (
        <footer className={styles.footer}>
          <span>4 KEYS. ONE RHYTHM.</span>
          <span>EUT-ZZA RHYTHM SYSTEM</span>
        </footer>
      ) : null}
    </main>
  );
};
