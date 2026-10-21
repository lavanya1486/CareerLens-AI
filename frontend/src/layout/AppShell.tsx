import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { BarChart3, FilePlus2, FileText, FolderOpen, LogOut, Menu, Settings, X } from "lucide-react";
import { systemApi } from "../api/endpoints";
import type { SystemStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Logo } from "../components/Logo";
import { cn } from "../lib/format";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/app/analyze", label: "New analysis", icon: FilePlus2 },
  { to: "/app/resumes", label: "Resumes", icon: FileText },
  { to: "/app/comparisons", label: "Saved comparisons", icon: FolderOpen },
  { to: "/app/settings", label: "Account settings", icon: Settings },
];

function EngineStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      systemApi
        .status()
        .then((s) => alive && (setStatus(s), setFailed(false)))
        .catch(() => alive && setFailed(true));
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  const up = !failed && status?.aiService.status === "UP";
  const label = failed ? "Backend unreachable" : !status ? "Checking analysis engine" : up ? "Analysis engine online" : "Analysis engine unavailable";
  return (
    <div className="flex items-start gap-2 text-xs text-muted" title={status?.aiService.model ?? undefined} role="status">
      <span className={cn("mt-1 size-2 shrink-0 rounded-full", !status && !failed ? "bg-line-strong" : up ? "bg-sage-500" : "bg-clay-500")} aria-hidden />
      <span>
        <span className="block">{label}</span>
        {up && status?.aiService.scoringVersion && <span className="block text-muted/80">Scoring version {status.aiService.scoringVersion}</span>}
      </span>
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    // Close the mobile menu whenever the route changes (state adjustment during render, no effect needed).
    setLastPath(location.pathname);
    setOpen(false);
  }

  // The route guard redirects to /login once the session is cleared.
  const signOut = () => logout();

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "bg-sage-700 text-paper shadow-sm" : "text-ink-soft hover:bg-sage-50 hover:text-ink",
            )
          }
        >
          <Icon className="size-4.5" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
      <aside className="hidden border-r border-line bg-surface/70 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:p-5">
        <Logo to="/app/dashboard" />
        <div className="mt-10 flex-1">{nav}</div>
        <div className="space-y-4 border-t border-line pt-4">
          <EngineStatus />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.fullName}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <button type="button" onClick={signOut} className="rounded-full p-2 text-muted hover:bg-sage-50 hover:text-ink" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4.5" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo to="/app/dashboard" />
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full p-2 hover:bg-sage-50" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"}>
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="border-b border-line bg-surface px-4 pb-4 pt-2 lg:hidden">
          {nav}
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <EngineStatus />
            <button type="button" onClick={signOut} className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}
