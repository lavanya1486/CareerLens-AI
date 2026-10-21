import type { MatchStatus, ScoreBand } from "../api/types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatScore(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string | null | undefined) {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export const BAND_META: Record<ScoreBand, { label: string; badge: string; bar: string; description: string }> = {
  strong: {
    label: "Strong alignment",
    badge: "bg-sage-100 text-sage-800 ring-sage-300",
    bar: "#4f6b49",
    description: "Most requirements are explicitly evidenced in the resume.",
  },
  good: {
    label: "Good alignment",
    badge: "bg-sage-50 text-sage-700 ring-sage-200",
    bar: "#83a17a",
    description: "Many requirements are evidenced, with some clear gaps.",
  },
  partial: {
    label: "Partial alignment",
    badge: "bg-mustard-100 text-mustard-800 ring-mustard-300",
    bar: "#d4ae45",
    description: "Several important requirements are not shown in the resume.",
  },
  limited: {
    label: "Limited alignment",
    badge: "bg-clay-100 text-clay-700 ring-clay-300",
    bar: "#b9694c",
    description: "The resume shows little evidence for this role's requirements.",
  },
};

export const STATUS_META: Record<MatchStatus, { label: string; badge: string; dot: string }> = {
  matched: { label: "Matched", badge: "bg-sage-100 text-sage-800 ring-sage-300", dot: "bg-sage-600" },
  partial: { label: "Partial", badge: "bg-mustard-100 text-mustard-800 ring-mustard-300", dot: "bg-mustard-500" },
  missing: { label: "Missing", badge: "bg-clay-100 text-clay-700 ring-clay-300", dot: "bg-clay-500" },
  review: { label: "Needs review", badge: "bg-paper text-ink-soft ring-line-strong", dot: "bg-muted" },
};

export function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
