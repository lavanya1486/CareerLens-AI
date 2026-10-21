import { createBrowserRouter, Navigate, type RouteObject, RouterProvider } from "react-router";
import { AuthProvider } from "./auth/AuthContext";
import { RedirectIfAuthenticated, RequireAuth } from "./auth/RequireAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import { Spinner } from "./components/ui";
import { AppShell } from "./layout/AppShell";
import { PublicLayout } from "./layout/PublicLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { NotFoundPage, RouteErrorPage } from "./pages/NotFoundPage";

// eslint-disable-next-line react-refresh/only-export-components -- exported for router tests
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/login", element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
      { path: "/register", element: <RedirectIfAuthenticated><RegisterPage /></RedirectIfAuthenticated> },
    ],
  },
  {
    path: "/app",
    element: <RequireAuth><AppShell /></RequireAuth>,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <Spinner label="Loading" />,
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      // Authenticated pages are code-split so the public landing/auth pages stay small.
      { path: "dashboard", lazy: async () => ({ Component: (await import("./pages/DashboardPage")).DashboardPage }) },
      { path: "resumes", lazy: async () => ({ Component: (await import("./pages/ResumesPage")).ResumesPage }) },
      { path: "resumes/:id", lazy: async () => ({ Component: (await import("./pages/ResumeReviewPage")).ResumeReviewPage }) },
      { path: "analyze", lazy: async () => ({ Component: (await import("./pages/NewAnalysisPage")).NewAnalysisPage }) },
      { path: "comparisons", lazy: async () => ({ Component: (await import("./pages/ComparisonsPage")).ComparisonsPage }) },
      { path: "comparisons/:id", lazy: async () => ({ Component: (await import("./pages/ComparisonDetailPage")).ComparisonDetailPage }) },
      { path: "settings", lazy: async () => ({ Component: (await import("./pages/SettingsPage")).SettingsPage }) },
    ],
  },
  { path: "*", element: <PublicLayout />, children: [{ path: "*", element: <NotFoundPage /> }] },
];

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
