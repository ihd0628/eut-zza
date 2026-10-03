import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useOutletContext } from "react-router";
import { logout, type User } from "../api/auth-api";
import { currentUserQueryKey } from "../query/query-keys";
import styles from "./AppLayout.module.css";

export const AppLayout = () => {
  const user = useOutletContext<User>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.productName} to="/">eut-zza · 읏짜</Link>
          <p className={styles.signedInUser}><strong>{user.email}</strong>님</p>
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
        <p className={styles.error} role="alert">{logoutMutation.error.message}</p>
      ) : null}
      <Outlet context={user} />
    </main>
  );
};
