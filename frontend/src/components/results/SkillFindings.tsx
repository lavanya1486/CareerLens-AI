import { useMemo, useState } from "react";
import { Quote } from "lucide-react";
import type { MatchStatus, SkillMatch } from "../../api/types";
import { cn, STATUS_META } from "../../lib/format";
import { Badge } from "../ui";

const FILTERS: ("all" | MatchStatus)[] = ["all", "matched", "partial", "missing", "review"];
const ORDER: Record<MatchStatus, number> = { missing: 0, partial: 1, review: 2, matched: 3 };

function SkillCard({ m }: { m: SkillMatch }) {
  const meta = STATUS_META[m.status];
  return (
    <li className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("size-2.5 rounded-full", meta.dot)} aria-hidden />
        <h4 className="text-base font-semibold">{m.skill}</h4>
        <Badge className={meta.badge}>{meta.label}</Badge>
        <Badge className={m.importance === "required" ? "bg-ink text-paper ring-ink" : "bg-paper text-ink-soft ring-line-strong"}>{m.importance === "required" ? "Required" : "Preferred"}</Badge>
        <span className="text-xs text-muted">{m.categoryLabel}</span>
        {m.status === "matched" && m.evidenceStrength !== "none" && <span className="ml-auto text-xs text-muted">Evidence: {m.evidenceStrength}</span>}
      </div>
      {m.alternatives.length > 0 && <p className="mt-1 text-xs text-muted">Accepted alternatives: {m.alternatives.join(", ")}{m.matchedVia && m.matchedVia !== m.skill ? ` · matched via ${m.matchedVia}` : ""}</p>}
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{m.reasoning}</p>

      {m.resumeEvidence.length > 0 && (
        <div className="mt-3 space-y-2">
          {m.resumeEvidence.slice(0, 3).map((e, i) => (
            <figure key={i} className="flex gap-2 rounded-xl bg-sage-50/70 p-3 text-sm ring-1 ring-sage-100">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-sage-500" aria-hidden />
              <div>
                <blockquote className="prose-evidence">{e.text}</blockquote>
                <figcaption className="mt-1 text-xs text-muted">Resume · {e.sectionLabel}</figcaption>
              </div>
            </figure>
          ))}
        </div>
      )}
      {m.relatedResumeSkills.length > 0 && m.status !== "matched" && (
        <p className="mt-3 text-sm"><span className="text-muted">Related in your resume:</span> <span className="font-medium">{m.relatedResumeSkills.join(", ")}</span></p>
      )}
      {m.semanticHint && (
        <div className="mt-3 rounded-xl border border-dashed border-line-strong p-3 text-sm">
          <p className="text-xs font-medium text-muted">Similar wording found{m.semanticSimilarity !== null ? ` (similarity ${m.semanticSimilarity.toFixed(2)})` : ""} — shown for review, not credited</p>
          <p className="prose-evidence mt-1">{m.semanticHint.text}</p>
        </div>
      )}
      <div className="mt-3 border-t border-line pt-3 text-xs text-muted">
        <span className="font-medium text-ink-soft">From the job description:</span> <span className="prose-evidence">“{m.jobEvidence}”</span>
      </div>
      {m.nextStep && <p className="mt-2 text-sm"><span className="font-medium">Next step:</span> {m.nextStep}</p>}
    </li>
  );
}

export function SkillFindings({ matches }: { matches: SkillMatch[] }) {
  const [filter, setFilter] = useState<"all" | MatchStatus>("all");
  const [importance, setImportance] = useState<"all" | "required" | "preferred">("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: matches.length };
    for (const m of matches) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [matches]);
  const visible = useMemo(
    () => matches
      .filter((m) => (filter === "all" || m.status === filter) && (importance === "all" || m.importance === importance))
      .sort((a, b) => (a.importance === b.importance ? ORDER[a.status] - ORDER[b.status] : a.importance === "required" ? -1 : 1)),
    [matches, filter, importance],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter skills by status">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors",
              filter === f ? "bg-sage-700 text-paper ring-sage-700" : "bg-surface text-ink-soft ring-line hover:bg-sage-50")}>
            {f === "all" ? "All" : STATUS_META[f].label} <span className="tabular-nums opacity-70">{counts[f] ?? 0}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          Show
          <select className="input h-9 w-auto py-1 text-sm" value={importance} onChange={(e) => setImportance(e.target.value as typeof importance)}>
            <option value="all">All priorities</option>
            <option value="required">Required only</option>
            <option value="preferred">Preferred only</option>
          </select>
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="mt-6 rounded-xl bg-paper p-4 text-sm text-muted">No skills match this filter.</p>
      ) : (
        <ul className="mt-5 grid gap-4 xl:grid-cols-2">{visible.map((m) => <SkillCard key={m.skill + m.importance} m={m} />)}</ul>
      )}
    </div>
  );
}
