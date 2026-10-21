import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import type { AnalysisResult } from "../../api/types";
import { Badge } from "../ui";

const EXP_LABEL: Record<AnalysisResult["experience"]["status"], string> = {
  met: "Meets stated experience",
  not_met: "Below stated experience",
  unknown: "Could not be determined",
  not_required: "No years stated",
};
const QUAL_LABEL = { likely_met: "Likely met", review: "Review manually", not_found: "Not found" } as const;

export function Qualifications({ result }: { result: AnalysisResult }) {
  const { experience, qualifications, competencies } = result;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="eyebrow">Experience</p>
        <p className="mt-2 font-medium">{EXP_LABEL[experience.status]}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{experience.explanation}</p>
        {experience.dateRanges.length > 0 && <p className="mt-2 text-xs text-muted">Date ranges found: {experience.dateRanges.join(", ")}</p>}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="eyebrow">Competencies</p>
        {competencies.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No soft-skill competencies were requested.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {competencies.map((c) => (
              <li key={c.name} className="flex items-start gap-2 text-sm">
                {c.found ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage-600" aria-label="Found" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-clay-500" aria-label="Not found" />}
                <span><span className="font-medium">{c.name}</span>{c.evidence && <span className="prose-evidence text-muted"> — “{c.evidence.text}”</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {qualifications.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
          <p className="eyebrow">Education &amp; certifications · manual review, not scored</p>
          <ul className="mt-3 divide-y divide-line">
            {qualifications.map((q) => (
              <li key={q.requirement} className="grid gap-1 py-3 sm:grid-cols-[1fr_9rem]">
                <div>
                  <p className="text-sm"><span className="capitalize text-muted">{q.kind}: </span>{q.requirement}</p>
                  <p className="mt-1 text-xs text-muted">{q.reasoning}</p>
                </div>
                <div className="sm:text-right">
                  <Badge className={q.status === "likely_met" ? "bg-sage-100 text-sage-800 ring-sage-300" : q.status === "review" ? "bg-mustard-100 text-mustard-800 ring-mustard-300" : "bg-clay-100 text-clay-700 ring-clay-300"}>
                    {q.status === "review" && <CircleHelp className="size-3" aria-hidden />} {QUAL_LABEL[q.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
