import type { Recommendation } from "../../api/types";
import { cn } from "../../lib/format";

const PRIORITY = { high: "bg-clay-100 text-clay-700", medium: "bg-mustard-100 text-mustard-800", low: "bg-sage-100 text-sage-800" } as const;
const CATEGORY = { learn: "Learn", highlight: "Highlight", clarity: "Clarity", project: "Project", evidence: "Evidence" } as const;

export function Recommendations({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">No recommendations for this comparison.</p>;
  return (
    <ol className="grid gap-4 md:grid-cols-2">
      {items.map((r, i) => (
        <li key={i} className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide", PRIORITY[r.priority])}>{r.priority}</span>
            <span className="text-muted">{CATEGORY[r.category]}</span>
          </div>
          <h4 className="mt-2 font-semibold">{r.title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.detail}</p>
          {r.grounding.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
              {r.grounding.map((g) => <li key={g}>Based on: <span className="prose-evidence">{g}</span></li>)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
