export type User = {
  id: string;
  email: string;
};

// 로그인 검증에만 사용하는 내부 데이터다. Route 응답으로 반환하지 않는다.
export type UserWithPasswordHash = User & {
  passwordHash: string;
};

// Repository에는 평문 비밀번호가 아니라 해시만 전달한다.
export type CreateUserInput = {
  email: string;
  passwordHash: string;
};

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("Email is already in use");
    this.name = "EmailAlreadyInUseError";
  }
}

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User ${userId} was not found`);
    this.name = "UserNotFoundError";
  }
}
