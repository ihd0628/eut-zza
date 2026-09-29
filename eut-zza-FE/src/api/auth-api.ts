import { HttpError, requestJson } from "./http";

export type User = {
  id: string;
  email: string;
};

export type Credentials = {
  email: string;
  password: string;
};

type AuthResponse = {
  user: User;
};

const jsonRequestInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const response = await requestJson<AuthResponse>("/auth/me");

    return response.user;
  } catch (error: unknown) {
    // 401은 서버 장애가 아니라 현재 로그인하지 않았다는 서버 상태다.
    if (error instanceof HttpError && error.status === 401) {
      return null;
    }

    throw error;
  }
};

export const signUp = async (
  credentials: Credentials,
): Promise<User> => {
  const response = await requestJson<AuthResponse>(
    "/auth/signup",
    jsonRequestInit(credentials),
  );

  return response.user;
};

export const login = async (credentials: Credentials): Promise<User> => {
  const response = await requestJson<AuthResponse>(
    "/auth/login",
    jsonRequestInit(credentials),
  );

  return response.user;
};

export const logout = async (): Promise<void> => {
  await requestJson<void>("/auth/logout", {
    method: "POST",
  });
};
