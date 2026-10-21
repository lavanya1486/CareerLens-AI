import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ensureCsrf, onUnauthorized } from "../api/client";
import { authApi } from "../api/endpoints";
import type { User } from "../api/types";

type Status = "loading" | "authenticated" | "anonymous";
/** Why a session was deliberately ended; drives where the guard sends the user and which notice is shown. */
export type SignOutReason = "logout" | "revoked" | "deleted";

interface AuthApi {
  status: Status;
  user: User | null;
  sessionExpired: boolean;
  /** Set after a deliberate sign-out (not after expiry); cleared by the next sign-in. */
  signOutReason: SignOutReason | null;
  login: (email: string, password: string) => Promise<User>;
  register: (fullName: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  clearSession: (reason?: SignOutReason) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureCsrf()
      .catch(() => undefined)
      .then(() => authApi.me())
      .then((me) => {
        if (cancelled) return;
        setUserState(me);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!cancelled) setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      setUserState(null);
      setSessionExpired(true);
      setStatus("anonymous");
    });
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const me = await authApi.login({ email, password });
    setUserState(me);
    setSessionExpired(false);
    setSignOutReason(null);
    setStatus("authenticated");
    return me;
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const me = await authApi.register({ fullName, email, password });
    setUserState(me);
    setSessionExpired(false);
    setSignOutReason(null);
    setStatus("authenticated");
    return me;
  }, []);

  const clearSession = useCallback((reason: SignOutReason = "logout") => {
    setUserState(null);
    setSessionExpired(false);
    setSignOutReason(reason);
    setStatus("anonymous");
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession("logout");
    }
  }, [clearSession]);

  const setUser = useCallback((u: User) => setUserState(u), []);

  const value = useMemo<AuthApi>(
    () => ({ status, user, sessionExpired, signOutReason, login, register, logout, setUser, clearSession }),
    [status, user, sessionExpired, signOutReason, login, register, logout, setUser, clearSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Only same-app paths are accepted as post-login destinations (prevents open redirects). */
// eslint-disable-next-line react-refresh/only-export-components
export function safeNext(next: string | null): string {
  // Only same-origin in-app paths: "/app" or "/app/...". Rejects absolute, protocol-relative and backslash tricks.
  if (next && (next === "/app" || next.startsWith("/app/") || next.startsWith("/app?")) && !next.includes("\\")) return next;
  return "/app/dashboard";
}
