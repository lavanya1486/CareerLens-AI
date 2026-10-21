import { isRouteErrorResponse, useRouteError } from "react-router";
import { LinkButton } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="font-display text-7xl font-semibold text-sage-300">404</p>
      <h1 className="mt-4 text-3xl font-semibold">This page does not exist</h1>
      <p className="mt-3 text-ink-soft">The link may be outdated, or the item may have been deleted.</p>
      <div className="mt-8 flex justify-center gap-3">
        <LinkButton to="/app/dashboard">Go to dashboard</LinkButton>
        <LinkButton to="/" variant="secondary">Home</LinkButton>
      </div>
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : null;
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="eyebrow">{status ? `Error ${status}` : "Unexpected error"}</p>
      <h1 className="mt-3 text-3xl font-semibold">Something went wrong on this page</h1>
      <p className="mt-3 text-ink-soft">Your saved data is safe. Try reloading, or return to the dashboard.</p>
      <div className="mt-8 flex justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="h-10 rounded-full bg-sage-700 px-5 text-sm font-medium text-paper">Reload</button>
        <a href="/app/dashboard" className="inline-flex h-10 items-center rounded-full px-5 text-sm font-medium ring-1 ring-line-strong">Dashboard</a>
      </div>
    </div>
  );
}
