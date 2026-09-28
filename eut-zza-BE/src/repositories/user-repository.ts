import { DatabaseError } from "pg";
import { pool } from "../db.js";
import {
  EmailAlreadyInUseError,
  type CreateUserInput,
  type User,
  type UserWithPasswordHash,
} from "../domain/user.js";

export const createUser = async (input: CreateUserInput): Promise<User> => {
  try {
    const result = await pool.query<User>(
      `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        RETURNING id, email
      `,
      [input.email, input.passwordHash],
    );

    const user = result.rows[0];

    if (user === undefined) {
      throw new Error("Inserted user was not returned");
    }

    return user;
  } catch (error: unknown) {
    if (
      error instanceof DatabaseError &&
      error.code === "23505" &&
      error.constraint === "users_email_key"
    ) {
      throw new EmailAlreadyInUseError();
    }

    throw error;
  }
};

export const findUserById = async (
  userId: string,
): Promise<User | undefined> => {
  const result = await pool.query<User>(
    `
      SELECT id, email
      FROM users
      WHERE id = $1
    `,
    [userId],
  );

  return result.rows[0];
};

export const findUserByEmail = async (
  email: string,
): Promise<UserWithPasswordHash | undefined> => {
  const result = await pool.query<UserWithPasswordHash>(
    `
      SELECT
        id,
        email,
        password_hash AS "passwordHash"
      FROM users
      WHERE email = $1
    `,
    [email],
  );

  return result.rows[0];
};
