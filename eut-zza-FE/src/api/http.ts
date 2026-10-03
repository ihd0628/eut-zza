const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export const getWebSocketUrl = (path: string): string => {
  const url = new URL(path, API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

type ErrorResponseBody = {
  error?: string;
  message?: string;
};

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as ErrorResponseBody;

    return body.error ?? body.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export const requestJson = async <ResponseBody>(
  path: string,
  init: RequestInit = {},
): Promise<ResponseBody> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    // 다른 Origin의 백엔드에 세션 Cookie를 보내고 Set-Cookie를 허용한다.
    credentials: "include",
  });

  if (!response.ok) {
    throw new HttpError(response.status, await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as ResponseBody;
  }

  return (await response.json()) as ResponseBody;
};
