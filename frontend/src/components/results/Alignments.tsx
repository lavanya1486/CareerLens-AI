import { useState } from "react";
import type { Alignment } from "../../api/types";
import { cn } from "../../lib/format";
import { Button } from "../ui";

const CLASS_STYLE = { strong: "text-sage-700 bg-sage-100", moderate: "text-mustard-800 bg-mustard-100", weak: "text-clay-700 bg-clay-100" } as const;

export function Alignments({ alignments }: { alignments: Alignment[] }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? alignments : alignments.slice(0, 8);
  if (alignments.length === 0) return <p className="text-sm text-muted">No job statements were available for semantic comparison.</p>;
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-paper/70 text-xs uppercase tracking-wide text-muted">
            <tr><th scope="col" className="p-3 font-medium">Job statement</th><th scope="col" className="p-3 font-medium">Closest resume line</th><th scope="col" className="w-32 p-3 font-medium">Alignment</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((a, i) => (
              <tr key={i} className="align-top">
                <td className="p-3">{a.requirement}{a.importance === "preferred" && <span className="ml-1 text-xs text-muted">(preferred)</span>}</td>
                <td className="p-3">{a.bestEvidence ? <><span className="prose-evidence">{a.bestEvidence.text}</span><span className="block text-xs text-muted">{a.bestEvidence.sectionLabel}</span></> : <span className="text-muted">—</span>}</td>
                <td className="p-3"><span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", CLASS_STYLE[a.classification])}>{a.classification}</span><span className="mt-1 block text-xs tabular-nums text-muted">cosine {a.similarity.toFixed(2)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {alignments.length > 8 && <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${alignments.length} statements`}</Button>}
    </div>
  );
}
