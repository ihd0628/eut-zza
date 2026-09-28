export const SESSION_COOKIE_NAME = "eut_zza_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;

export type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};
