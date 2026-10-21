import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCookies, jsonResponse } from "../test/utils";
import { ApiError, download, onUnauthorized, request } from "./client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  clearCookies();
  // A real session already holds the CSRF cookie; without it the client first calls /auth/csrf.
  document.cookie = "XSRF-TOKEN=seeded; path=/";
});
afterEach(() => {
  onUnauthorized(null);
  vi.unstubAllGlobals();
});

const lastInit = () => fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

describe("request", () => {
  it("sends JSON GETs with same-origin credentials and parses the body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(request<{ ok: boolean }>("/dashboard")).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/dashboard");
    expect(lastInit().credentials).toBe("same-origin");
    expect(headersOf(lastInit()).Accept).toBe("application/json");
  });

  it("fetches a CSRF cookie first when none exists yet", async () => {
    clearCookies();
    fetchMock
      .mockImplementationOnce(async () => {
        document.cookie = "XSRF-TOKEN=fresh; path=/";
        return new Response(null, { status: 204 });
      })
      .mockResolvedValueOnce(jsonResponse(undefined, 204));
    await request("/auth/logout", { method: "POST" });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/v1/auth/csrf", "/api/v1/auth/logout"]);
    expect(headersOf(lastInit())["X-XSRF-TOKEN"]).toBe("fresh");
  });

  it("explains blocked cookies instead of sending a request the server must reject", async () => {
    clearCookies();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const err = await request("/auth/register", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("COOKIES_BLOCKED");
    expect((err as ApiError).message).toMatch(/own tab/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("echoes the XSRF-TOKEN cookie as a header on state-changing requests", async () => {
    document.cookie = "XSRF-TOKEN=token-123; path=/";
    fetchMock.mockResolvedValueOnce(jsonResponse(undefined, 204));
    await request("/auth/logout", { method: "POST" });
    expect(headersOf(lastInit())["X-XSRF-TOKEN"]).toBe("token-123");
  });

  it("drops empty query parameters", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await request("/comparisons", { query: { q: "java", jobTitle: "", minScore: undefined, page: 0 } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/comparisons?q=java&page=0");
  });

  it("maps the backend error body onto ApiError, including field errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      status: 400, code: "VALIDATION_ERROR", message: "Invalid input",
      fieldErrors: [{ field: "email", message: "must be a well-formed email address" }],
    }, 400));
    const error = await request("/auth/register", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ field: "email" }] });
  });

  it("ends the session on 401 UNAUTHORIZED", async () => {
    const listener = vi.fn();
    onUnauthorized(listener);
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 401, code: "UNAUTHORIZED", message: "Authentication is required." }, 401));
    await expect(request("/resumes")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not end the session when a re-entered password is wrong (401 INVALID_PASSWORD)", async () => {
    const listener = vi.fn();
    onUnauthorized(listener);
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 401, code: "INVALID_PASSWORD", message: "The password is incorrect." }, 401));
    await expect(request("/users/me/password", { method: "POST", body: {} })).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports a user-initiated abort as CANCELLED", async () => {
    // Behaves like real fetch: rejects at once for an already-aborted signal, otherwise when it aborts.
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      const fail = () => reject(new DOMException("aborted", "AbortError"));
      if (init?.signal?.aborted) fail();
      else init?.signal?.addEventListener("abort", fail);
    }));
    const controller = new AbortController();
    const pending = request("/analyses", { method: "POST", body: {}, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("reports an abort during an in-flight request as CANCELLED", async () => {
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const controller = new AbortController();
    const pending = request("/analyses", { method: "POST", body: {}, signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("uses a friendly fallback message when the error has no JSON body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Content-Type": "text/plain" } }));
    await expect(request("/analyses")).rejects.toMatchObject({ status: 429, code: "HTTP_429", message: expect.stringMatching(/too many requests/i) });
  });
});

describe("download", () => {
  it("accepts the binary type (and JSON for errors) and saves with the server filename", async () => {
    const createObjectURL = vi.fn(() => "blob:report");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response(new Blob(["%PDF-1.7"]), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="careerlens-northwind.pdf"' },
    }));

    await download("/comparisons/abc/report.pdf", "fallback.pdf", "application/pdf");

    // Regression: Accept: application/json alone made the PDF endpoint fail.
    expect(headersOf(lastInit()).Accept).toBe("application/pdf, application/json;q=0.9");
    expect(createObjectURL).toHaveBeenCalledOnce();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("careerlens-northwind.pdf");
  });
});
