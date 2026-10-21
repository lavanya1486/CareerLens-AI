import { Link, Outlet } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Logo } from "../components/Logo";
import { LinkButton } from "../components/ui";

export function PublicLayout() {
  const { status } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          {status === "authenticated" ? (
            <LinkButton to="/app/dashboard" size="sm">Open dashboard</LinkButton>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink">Sign in</Link>
              <LinkButton to="/register" size="sm">Create account</LinkButton>
            </>
          )}
        </nav>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-8">
          <p>CareerLens AI — explainable resume and job description matching.</p>
          <p>Scores describe document alignment only. They are not a prediction of hiring outcomes.</p>
        </div>
      </footer>
    </div>
  );
}
