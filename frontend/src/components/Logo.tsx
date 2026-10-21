import { Link } from "react-router";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5" aria-label="CareerLens AI home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#4F6B49" />
        <circle cx="28" cy="28" r="13" fill="none" stroke="#F6F0E2" strokeWidth="5" />
        <path d="M37.5 37.5 49 49" stroke="#EBCF7A" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">
        CareerLens <span className="text-sage-600">AI</span>
      </span>
    </Link>
  );
}
