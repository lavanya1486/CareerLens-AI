import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error.name, info.componentStack?.split("\n")[1]?.trim());
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="eyebrow">Unexpected error</p>
        <h1 className="mt-3 text-3xl font-semibold">This page hit a problem</h1>
        <p className="mt-3 text-ink-soft">Your saved data is safe. Reload the page to try again; if it keeps happening, go back to the dashboard.</p>
        <div className="mt-8 flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="h-10 rounded-full bg-sage-700 px-5 text-sm font-medium text-paper hover:bg-sage-800">Reload page</button>
          <a href="/app/dashboard" className="inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-ink ring-1 ring-line-strong hover:bg-sage-50">Go to dashboard</a>
        </div>
      </main>
    );
  }
}
