import type { ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { Spinner } from "../components/ui";
import { safeNext, useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signOutReason } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Spinner label="Checking your session" />;
  // After a deliberate sign-out this guard is the single place that redirects (avoids racing page-level
  // navigation), and it does not carry this page over to whoever signs in next on this device.
  if (status === "anonymous" && signOutReason) return <Navigate to={signOutReason === "deleted" ? "/" : "/login"} replace />;
  if (status === "anonymous") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === "loading") return <Spinner label="Checking your session" />;
  // Honour ?next= here too: this guard re-renders the moment sign-in succeeds and would otherwise
  // race the login page's own redirect and always land on the dashboard.
  if (status === "authenticated") return <Navigate to={safeNext(params.get("next"))} replace />;
  return <>{children}</>;
}
