import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { login, signUp, type Credentials, type User } from "../api/auth-api";
import { currentUserQueryKey } from "../query/query-keys";
import styles from "./AuthPanel.module.css";
import { RecordArtwork } from "./RecordArtwork";

type AuthMode = "login" | "signup";

type AuthenticationInput = {
  mode: AuthMode;
  credentials: Credentials;
};

export const AuthPanel = ({ mode }: { mode: AuthMode }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const authenticationMutation = useMutation<User, Error, AuthenticationInput>({
    mutationFn: async ({ mode: requestedMode, credentials }) => {
      if (requestedMode === "signup") {
        await signUp(credentials);
      }

      return login(credentials);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserQueryKey, user);
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(
        from?.startsWith("/") && !from.startsWith("//") ? from : "/",
        {
          replace: true,
        },
      );
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    authenticationMutation.mutate({
      mode,
      credentials: {
        email,
        password,
      },
    });
  };

  const changeMode = (nextMode: AuthMode): void => {
    authenticationMutation.reset();
    void navigate(`/${nextMode}`, { state: location.state, replace: true });
  };

  return (
    <main className={styles.page}>
      <section className={styles.identity} aria-label="읏짜 리듬 아케이드">
        <span className={styles.systemLabel}>4 KEY ONLINE RHYTHM ARCADE</span>
        <p className={styles.wordmark}>
          eut-zza<span>읏짜</span>
        </p>
        <h2>
          FIND YOUR
          <br />
          <span>RHYTHM.</span>
        </h2>
        <div className={styles.artwork}>
          <RecordArtwork />
        </div>
        <p className={styles.identityFooter}>SOLO PLAY / MULTIPLAYER BATTLE</p>
      </section>
      <section className={styles.card} aria-labelledby="auth-title">
        <p className={styles.productName}>PLAYER ACCESS / 01</p>
        <h1 className={styles.title} id="auth-title">
          {mode === "login" ? "WELCOME BACK." : "NEW PLAYER."}
        </h1>
        <p className={styles.description}>
          {mode === "login"
            ? "계정으로 로그인하면 리듬게임을 시작할 수 있습니다."
            : "계정을 만든 뒤 자동으로 로그인합니다."}
        </p>

        <div className={styles.modeTabs} aria-label="인증 방식 선택">
          <button
            type="button"
            className={`${styles.tabButton} ${
              mode === "login" ? styles.active : ""
            }`}
            onClick={() => changeMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${
              mode === "signup" ? styles.active : ""
            }`}
            onClick={() => changeMode("signup")}
          >
            회원가입
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            이메일
            <input
              className={styles.input}
              type="email"
              name="email"
              value={email}
              autoComplete="email"
              maxLength={254}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            비밀번호
            <input
              className={styles.input}
              type="password"
              name="password"
              value={password}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "signup" ? 8 : 1}
              maxLength={128}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {authenticationMutation.error !== null ? (
            <p className={styles.error} role="alert">
              {authenticationMutation.error.message}
            </p>
          ) : null}

          <button
            className={styles.submitButton}
            type="submit"
            disabled={authenticationMutation.isPending}
          >
            {authenticationMutation.isPending
              ? "처리 중..."
              : mode === "login"
                ? "로그인"
                : "회원가입 후 로그인"}
          </button>
        </form>
      </section>
    </main>
  );
};
