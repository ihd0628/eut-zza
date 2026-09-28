import { SESSION_DURATION_MS } from "../domain/session.js";
import type { User } from "../domain/user.js";
import {
  createUser,
  findUserByEmail,
} from "../repositories/user-repository.js";
import {
  createSession,
  deleteSessionByTokenHash,
  findUserBySessionTokenHash,
} from "../repositories/session-repository.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import {
  createSessionToken,
  hashSessionToken,
} from "../security/session-token.js";

type SignUpInput = {
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type LoginResult = {
  user: User;
  sessionToken: string;
  expiresAt: Date;
};

export class InvalidCredentialsError extends Error {
  constructor() {
    // 이메일 존재 여부와 비밀번호 불일치를 동일하게 표현한다.
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    // 쿠키 누락, 잘못된 토큰, 만료된 세션을 외부에 구분해서 노출하지 않는다.
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export const signUp = async (input: SignUpInput): Promise<User> => {
  // 같은 이메일의 대소문자와 앞뒤 공백 차이로 계정이 나뉘지 않게 한다.
  const normalizedEmail = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  // 평문 비밀번호는 Repository와 PostgreSQL에 전달하지 않는다.
  return createUser({
    email: normalizedEmail,
    passwordHash,
  });
};

export const login = async (input: LoginInput): Promise<LoginResult> => {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (user === undefined) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(
    user.passwordHash,
    input.password,
  );

  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  const sessionToken = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await createSession({
    userId: user.id,
    tokenHash: hashSessionToken(sessionToken),
    expiresAt,
  });

  // passwordHash와 DB에 저장한 tokenHash는 Route 응답에 포함하지 않는다.
  return {
    user: {
      id: user.id,
      email: user.email,
    },
    sessionToken,
    expiresAt,
  };
};

export const getCurrentUser = async (
  sessionToken: string | undefined,
): Promise<User> => {
  if (sessionToken === undefined) {
    throw new AuthenticationRequiredError();
  }

  const user = await findUserBySessionTokenHash(
    hashSessionToken(sessionToken),
  );

  if (user === undefined) {
    throw new AuthenticationRequiredError();
  }

  return user;
};

export const logout = async (
  sessionToken: string | undefined,
): Promise<void> => {
  // 이미 쿠키가 없거나 세션이 삭제된 로그아웃 요청도 성공으로 처리한다.
  if (sessionToken === undefined) {
    return;
  }

  await deleteSessionByTokenHash(hashSessionToken(sessionToken));
};
