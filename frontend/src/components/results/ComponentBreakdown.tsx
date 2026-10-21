import type { ComponentScore } from "../../api/types";
import { formatScore } from "../../lib/format";

export function ComponentBreakdown({ components }: { components: ComponentScore[] }) {
  return (
    <ul className="divide-y divide-line">
      {components.map((c) => (
        <li key={c.key} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{c.label}</p>
            {c.available ? (
              <p className="text-sm tabular-nums text-muted">
                <span className="font-display text-xl font-semibold text-ink">{formatScore(c.score, 1)}</span>
                <span className="ml-2">× {(c.effectiveWeight * 100).toFixed(0)}% = {formatScore(c.contribution, 1)} pts</span>
              </p>
            ) : (
              <p className="text-sm text-muted">Not measurable · weight redistributed</p>
            )}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper" role="meter" aria-label={`${c.label} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.available ? Math.round(c.score) : undefined}>
            {c.available && <div className="h-full rounded-full bg-sage-500" style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.explanation}</p>
        </li>
      ))}
    </ul>
  );
}
