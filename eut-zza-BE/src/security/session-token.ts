import { createHash, randomBytes } from "node:crypto";

// 32바이트의 암호학적으로 안전한 난수를 URL과 Cookie에서 쓰기 좋은 문자열로 만든다.
export const createSessionToken = (): string => {
  return randomBytes(32).toString("base64url");
};

// 원본 토큰은 브라우저에만 보내고, PostgreSQL에는 SHA-256 해시만 저장한다.
export const hashSessionToken = (token: string): string => {
  return createHash("sha256").update(token).digest("hex");
};
