import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { User } from "../api/types";
import { AuthProvider } from "../auth/AuthContext";
import { RedirectIfAuthenticated, RequireAuth } from "../auth/RequireAuth";
import { comparisonFixture, renderWithRouter } from "../test/utils";

vi.mock("../api/endpoints", () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() },
  userApi: { update: vi.fn(), changePassword: vi.fn(), revokeSessions: vi.fn(), deleteAccount: vi.fn() },
  comparisonApi: { get: vi.fn(), update: vi.fn(), remove: vi.fn(), list: vi.fn(), downloadPdf: vi.fn(), downloadJson: vi.fn() },
  systemApi: { status: vi.fn() },
}));

const { authApi, comparisonApi, userApi } = await import("../api/endpoints");
const { ComparisonDetailPage } = await import("./ComparisonDetailPage");
const { LoginPage } = await import("./AuthPages");
const { SettingsPage } = await import("./SettingsPage");

const user: User = { id: "u1", email: "ananya@example.com", fullName: "Ananya Rao", headline: null, createdAt: "2026-10-18T10:00:00Z" };

beforeEach(() => {
  vi.mocked(authApi.me).mockReset();
  // The auth provider fetches a CSRF cookie before probing the session.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  document.cookie = "XSRF-TOKEN=seeded; path=/";
});

describe("ComparisonDetailPage", () => {
  const draft = { ...comparisonFixture, saved: false };
  const renderDetail = (route = `/app/comparisons/${draft.id}?fresh=1`) =>
    renderWithRouter(
      <Routes>
        <Route path="/app/comparisons/:id" element={<ComparisonDetailPage />} />
        <Route path="/app/comparisons" element={<p>Saved list</p>} />
      </Routes>,
      route,
    );

  it("shows the result as an unsaved draft and saves it", async () => {
    vi.mocked(comparisonApi.get).mockResolvedValue(draft);
    vi.mocked(comparisonApi.update).mockResolvedValue({ ...draft, saved: true });
    const ue = userEvent.setup();
    renderDetail();

    expect(await screen.findByRole("heading", { level: 1, name: draft.name })).toBeInTheDocument();
    expect(screen.getByText("Analysis complete — this is an unsaved draft")).toBeInTheDocument();
    expect(screen.getAllByText(/not a probability of being interviewed or hired/).length).toBeGreaterThan(0);

    await ue.click(screen.getByRole("button", { name: "Save comparison" }));
    expect(comparisonApi.update).toHaveBeenCalledWith(draft.id, { saved: true });
    await waitFor(() => expect(screen.queryByText(/unsaved draft/)).not.toBeInTheDocument());
    expect(screen.getByText("Saved comparison")).toBeInTheDocument();
  });

  it("deletes only after confirmation and returns to the list", async () => {
    vi.mocked(comparisonApi.get).mockResolvedValue(comparisonFixture);
    vi.mocked(comparisonApi.remove).mockResolvedValue(undefined);
    const ue = userEvent.setup();
    renderDetail(`/app/comparisons/${comparisonFixture.id}`);

    await ue.click(await screen.findByRole("button", { name: "Delete comparison" }));
    expect(comparisonApi.remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await ue.click(within(dialog).getByRole("button", { name: "Delete comparison" }));
    expect(comparisonApi.remove).toHaveBeenCalledWith(comparisonFixture.id);
    expect(await screen.findByText("Saved list")).toBeInTheDocument();
  });

  it("explains a 404 without leaking whether the comparison exists for someone else", async () => {
    vi.mocked(comparisonApi.get).mockRejectedValue(new ApiError(404, "NOT_FOUND", "Not found"));
    renderDetail("/app/comparisons/someone-elses-id");
    expect(await screen.findByText("Comparison not found")).toBeInTheDocument();
    expect(screen.getByText(/belongs to a different account/)).toBeInTheDocument();
  });

  it("downloads the PDF report", async () => {
    vi.mocked(comparisonApi.get).mockResolvedValue(comparisonFixture);
    vi.mocked(comparisonApi.downloadPdf).mockResolvedValue(undefined);
    const ue = userEvent.setup();
    renderDetail(`/app/comparisons/${comparisonFixture.id}`);
    await ue.click(await screen.findByRole("button", { name: "PDF report" }));
    expect(comparisonApi.downloadPdf).toHaveBeenCalledWith(comparisonFixture.id);
  });
});

describe("LoginPage", () => {
  const renderLogin = () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Authentication is required."));
    return renderWithRouter(
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated>} />
          <Route path="/app/dashboard" element={<p>Dashboard page</p>} />
          <Route path="/app/comparisons" element={<p>Comparisons page</p>} />
        </Routes>
      </AuthProvider>,
      "/login?next=%2Fapp%2Fcomparisons",
    );
  };

  it("validates before calling the API", async () => {
    const ue = userEvent.setup();
    renderLogin();
    await ue.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it("shows the server message on bad credentials", async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."));
    const ue = userEvent.setup();
    renderLogin();
    await ue.type(await screen.findByLabelText("Email"), "ananya@example.com");
    await ue.type(screen.getByLabelText("Password"), "wrong-password-1");
    await ue.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  it("returns to the requested in-app page after signing in", async () => {
    vi.mocked(authApi.login).mockResolvedValue(user);
    const ue = userEvent.setup();
    renderLogin();
    await ue.type(await screen.findByLabelText("Email"), "ananya@example.com");
    await ue.type(screen.getByLabelText("Password"), "Synthetic2026");
    await ue.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Comparisons page")).toBeInTheDocument();
    // Regression: the /login guard used to win the race and redirect to the dashboard.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
    expect(screen.getByText("Comparisons page")).toBeInTheDocument();
  });
});

describe("RequireAuth", () => {
  it("sends anonymous visitors to sign in, remembering where they were going", async () => {
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Authentication is required."));
    renderWithRouter(
      <AuthProvider>
        <Routes>
          <Route path="/app/settings" element={<RequireAuth><p>Secret settings</p></RequireAuth>} />
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </AuthProvider>,
      "/app/settings",
    );
    expect(await screen.findByTestId("location")).toHaveTextContent("/login?next=%2Fapp%2Fsettings");
    expect(screen.queryByText("Secret settings")).not.toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  it("flags a wrong current password on the field and keeps the user signed in", async () => {
    vi.mocked(authApi.me).mockResolvedValue(user);
    vi.mocked(userApi.changePassword).mockRejectedValue(new ApiError(401, "INVALID_PASSWORD", "The password is incorrect."));
    const ue = userEvent.setup();
    renderWithRouter(<AuthProvider><RequireAuth><SettingsPage /></RequireAuth></AuthProvider>);

    await ue.type(await screen.findByLabelText("Current password"), "not-my-password1");
    await ue.type(screen.getByLabelText("New password"), "Brandnew2026");
    await ue.type(screen.getByLabelText("Confirm new password"), "Brandnew2026");
    await ue.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ananya Rao");
  });
});

import { useLocation } from "react-router";
function LocationProbe() {
  const l = useLocation();
  return <p data-testid="location">{l.pathname + l.search}</p>;
}
