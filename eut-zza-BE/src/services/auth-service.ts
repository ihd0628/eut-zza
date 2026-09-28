import type { User } from "../domain/user.js";
import {
  createUser,
  findUserByEmail,
} from "../repositories/user-repository.js";
import { createSession } from "../repositories/session-repository.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import {
  createSessionToken,
  hashSessionToken,
} from "../security/session-token.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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
