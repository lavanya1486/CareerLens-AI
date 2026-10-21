import type { ApiErrorBody, FieldViolation } from "./types";

const BASE = "/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
export const COOKIES_BLOCKED_MESSAGE =
  "Your browser didn't keep this site's security cookie, so the request can't be sent safely. " +
  "This usually happens when the app is shown inside another page: open it in its own tab and allow cookies for this site.";

/** Error raised for any non-2xx response or network failure, carrying the backend's error code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldViolation[];
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, fieldErrors: FieldViolation[] = [], requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.requestId = requestId;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

/** The auth layer registers here so an expired session anywhere sends the user back to sign in. */
export function onUnauthorized(listener: UnauthorizedListener | null) {
  unauthorizedListener = listener;
}

export function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<void> | null = null;

export function ensureCsrf(force = false): Promise<void> {
  if (!force && readCookie("XSRF-TOKEN")) return Promise.resolve();
  if (!csrfPromise) {
    csrfPromise = fetch(`${BASE}/auth/csrf`, { credentials: "same-origin" })
      .then(() => undefined)
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined | null>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Accept header; downloads must also accept JSON so error bodies can still be returned. */
  accept?: string;
  /** Skip the global "session expired" redirect (used by the initial /users/me probe). */
  silentUnauthorized?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    if (response.headers.get("Content-Type")?.includes("json")) body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const fallback: Record<number, string> = {
    403: "The server refused this request. Reload the page and try again; if it keeps happening, the server may not allow this site's address.",
    413: "That upload is too large.",
    429: "Too many requests. Please wait a moment and try again.",
    502: "The service is temporarily unreachable. Please try again.",
    503: "The service is temporarily unavailable. Please try again.",
    504: "The request took too long. Please try again.",
  };
  return new ApiError(
    response.status,
    body?.code ?? `HTTP_${response.status}`,
    body?.message ?? fallback[response.status] ?? "Something went wrong. Please try again.",
    body?.fieldErrors ?? [],
    body?.requestId ?? response.headers.get("X-Request-Id") ?? undefined,
  );
}

async function send(path: string, opts: RequestOptions, retried = false): Promise<Response> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: opts.accept ?? "application/json" };
  if (method !== "GET") {
    await ensureCsrf();
    const token = readCookie("XSRF-TOKEN");
    // No cookie after a successful /auth/csrf means the browser refused it (blocked cookies or a cross-site
    // frame). The backend would reject the request anyway, so explain the actual problem instead.
    if (!token) throw new ApiError(0, "COOKIES_BLOCKED", COOKIES_BLOCKED_MESSAGE);
    headers["X-XSRF-TOKEN"] = token;
  }
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", onAbort);
  // The caller may have aborted while we awaited the CSRF cookie; the listener would never fire then.
  if (opts.signal?.aborted) controller.abort(opts.signal.reason);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    if (opts.signal?.aborted) throw new ApiError(0, "CANCELLED", "The request was cancelled.");
    if (controller.signal.aborted) throw new ApiError(0, "TIMEOUT", "The request took too long. Please try again.");
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach CareerLens. Check your connection and try again.");
  } finally {
    window.clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  if (response.status === 403 && method !== "GET" && !retried) {
    const err = await toApiError(response.clone());
    if (err.code === "CSRF_INVALID") {
      await ensureCsrf(true);
      return send(path, opts, true);
    }
  }
  if (!response.ok) {
    const err = await toApiError(response);
    // Only a missing/expired session ends the session; a wrong re-entered password (INVALID_PASSWORD) must not.
    if (err.status === 401 && err.code === "UNAUTHORIZED" && !opts.silentUnauthorized) unauthorizedListener?.();
    throw err;
  }
  return response;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const response = await send(path, opts);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Downloads a binary/attachment endpoint and saves it using the server-provided filename. */
export async function download(path: string, fallbackName: string, accept: string): Promise<void> {
  const response = await send(path, { timeoutMs: 60_000, accept: `${accept}, application/json;q=0.9` });
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
