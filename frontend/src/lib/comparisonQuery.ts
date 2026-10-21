import type { ComparisonQuery } from "../api/types";

export const PAGE_SIZE = 10;

export function readQuery(params: URLSearchParams): ComparisonQuery {
  const num = (k: string) => {
    const v = params.get(k);
    return v !== null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  };
  return {
    q: params.get("q") ?? undefined,
    jobTitle: params.get("jobTitle") ?? undefined,
    minScore: num("minScore"),
    maxScore: num("maxScore"),
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    sort: params.get("sort") ?? "createdAt,desc",
    page: num("page") ?? 0,
    size: PAGE_SIZE,
  };
}
