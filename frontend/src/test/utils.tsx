import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import type { ComparisonDetail } from "../api/types";
import { ToastProvider } from "../components/Toast";
import detailJson from "./fixtures/comparison-detail.json";

/** A real ComparisonDetail recorded from the running stack with synthetic demo data (scripts/record_frontend_fixture.py). */
export const comparisonFixture = detailJson as unknown as ComparisonDetail;

export function renderWithRouter(ui: ReactElement, route = "/") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ToastProvider>,
  );
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function clearCookies() {
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}
