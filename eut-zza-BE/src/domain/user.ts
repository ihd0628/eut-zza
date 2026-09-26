export type User = {
  id: string;
  email: string;
};

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User ${userId} was not found`);
    this.name = "UserNotFoundError";
  }
}
