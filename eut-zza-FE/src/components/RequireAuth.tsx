import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router";
import { getCurrentUser } from "../api/auth-api";
import { currentUserQueryKey } from "../query/query-keys";
import styles from "./RequireAuth.module.css";

export const RequireAuth = () => {
  const location = useLocation();
  const userQuery = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: getCurrentUser,
    retry: false,
  });

  if (userQuery.isPending) {
    return <p className={styles.status}>로그인 상태를 확인하고 있습니다.</p>;
  }

  if (userQuery.isError) {
    return (
      <section className={styles.status}>
        <p role="alert">서버에 연결할 수 없습니다: {userQuery.error.message}</p>
        <button type="button" onClick={() => void userQuery.refetch()}>
          다시 시도
        </button>
      </section>
    );
  }

  if (userQuery.data === null) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }

  return <Outlet context={userQuery.data} />;
};
