import { Lightbulb } from "lucide-react";
import type { ProjectAnalysis } from "../../api/types";
import { formatScore } from "../../lib/format";
import { Badge } from "../ui";

export function ProjectList({ projects }: { projects: ProjectAnalysis[] }) {
  if (projects.length === 0) {
    return <p className="rounded-xl bg-paper p-4 text-sm text-muted">No projects section was detected in this resume, so project relevance could not be assessed. Adding a “Projects” heading with one project per entry makes this section work.</p>;
  }
  return (
    <ol className="space-y-4">
      {projects.map((p) => (
        <li key={p.rank + p.name} className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start gap-4">
            <span className="font-display text-3xl font-semibold text-mustard-700" aria-label={`Rank ${p.rank}`}>#{p.rank}</span>
            <div className="min-w-0 flex-1">
              <h4 className="text-lg font-semibold">{p.name}</h4>
              <p className="mt-0.5 text-xs text-muted">Relevance {formatScore(p.relevanceScore)} / 100 · skill coverage {formatScore(p.skillCoverageScore)} · semantic {formatScore(p.semanticScore)}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{p.explanation}</p>
          {p.matchedRequirements.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.matchedRequirements.map((r) => (
                <Badge key={r.skill} className={r.importance === "required" ? "bg-sage-100 text-sage-800 ring-sage-300" : "bg-sage-50 text-sage-700 ring-sage-200"}>{r.skill}</Badge>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {p.evidence.length > 0 && (
              <div>
                <p className="eyebrow">Evidence in this project</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{p.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            {p.missingEvidence.length > 0 && (
              <div>
                <p className="eyebrow text-clay-700!">Not shown in this project</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">{p.missingEvidence.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
          </div>
          {p.futureImprovements.length > 0 && (
            <div className="mt-4 rounded-xl bg-mustard-50 p-4 ring-1 ring-mustard-200">
              <p className="flex items-center gap-2 text-sm font-medium text-mustard-800"><Lightbulb className="size-4" aria-hidden /> Ideas for future work — not yet done</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">{p.futureImprovements.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
