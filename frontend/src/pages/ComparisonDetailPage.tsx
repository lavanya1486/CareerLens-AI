import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Bookmark, FileDown, FileJson, Pencil, Trash2 } from "lucide-react";
import { ApiError } from "../api/client";
import { comparisonApi } from "../api/endpoints";
import type { ComparisonDetail } from "../api/types";
import { ConfirmDialog, Dialog } from "../components/Dialog";
import { Alignments } from "../components/results/Alignments";
import { ComponentBreakdown } from "../components/results/ComponentBreakdown";
import { ProjectList } from "../components/results/ProjectList";
import { Qualifications } from "../components/results/Qualifications";
import { Recommendations } from "../components/results/Recommendations";
import { SkillFindings } from "../components/results/SkillFindings";
import { ScoreRing } from "../components/ScoreRing";
import { useToast } from "../components/Toast";
import { Alert, Badge, Button, Field, LinkButton, SectionTitle, Spinner, TextInput } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { BAND_META, formatDateTime } from "../lib/format";

const SECTIONS = [
  ["overview", "Overview"],
  ["skills", "Skill evidence"],
  ["projects", "Projects"],
  ["qualifications", "Experience & qualifications"],
  ["evidence", "Supporting evidence"],
  ["recommendations", "Recommendations"],
  ["methodology", "Methodology"],
] as const;

const COUNT_LABELS = { matched: "Matched", partial: "Partial / related", missing: "Missing", review: "Needs review" } as const;

function RenameDialog({ comparison, open, onClose, onSaved }: { comparison: ComparisonDetail; open: boolean; onClose: () => void; onSaved: (c: ComparisonDetail) => void }) {
  const [name, setName] = useState(comparison.name);
  const [jobTitle, setJobTitle] = useState(comparison.jobTitle ?? "");
  const [company, setCompany] = useState(comparison.company ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    try {
      onSaved(await comparisonApi.update(comparison.id, { name: name.trim(), jobTitle: jobTitle.trim(), company: company.trim() }));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Saving failed.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} title="Rename comparison" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Name">{(a) => <TextInput {...a} value={name} maxLength={150} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Job title" optional>{(a) => <TextInput {...a} value={jobTitle} maxLength={150} onChange={(e) => setJobTitle(e.target.value)} />}</Field>
        <Field label="Company" optional>{(a) => <TextInput {...a} value={company} maxLength={150} onChange={(e) => setCompany(e.target.value)} />}</Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ComparisonDetailPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: c, error, loading, setData } = useApi(() => comparisonApi.get(id), [id]);
  const [busy, setBusy] = useState<null | "save" | "pdf" | "json" | "delete">(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading && !c) return <Spinner label="Loading comparison" />;
  if (error) {
    return (
      <Alert tone="danger" title={error.status === 404 ? "Comparison not found" : "This comparison could not be loaded"} action={<LinkButton to="/app/comparisons" variant="secondary" size="sm">Back to saved comparisons</LinkButton>}>
        {error.status === 404 ? "It may have been deleted, an unsaved draft may have expired, or it belongs to a different account." : error.message}
      </Alert>
    );
  }
  if (!c) return null;
  const r = c.result;
  const band = BAND_META[c.scoreBand];

  const act = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That action failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const save = () => act("save", async () => {
    setData(await comparisonApi.update(c.id, { saved: true }));
    toast.success("Comparison saved to your history.");
  });
  const remove = () => act("delete", async () => {
    await comparisonApi.remove(c.id);
    toast.success("Comparison deleted.");
    navigate("/app/comparisons", { replace: true });
  });

  const counts = r.skillMatches.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {});

  return (
    <>
      <LinkButton to={c.saved ? "/app/comparisons" : "/app/analyze"} variant="ghost" size="sm" className="-ml-3 mb-4">
        <ArrowLeft className="size-4" aria-hidden /> {c.saved ? "Saved comparisons" : "New analysis"}
      </LinkButton>

      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{c.saved ? "Saved comparison" : "Analysis result · draft"}</p>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">{c.name}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {c.resumeTitle ? <>Resume: <span className="font-medium">{c.resumeTitle}</span></> : "Resume deleted"} · analysed {formatDateTime(c.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!c.saved && <Button onClick={save} loading={busy === "save"} variant="accent"><Bookmark className="size-4" aria-hidden /> Save comparison</Button>}
          <Button variant="secondary" onClick={() => setRenaming(true)}><Pencil className="size-4" aria-hidden /> Rename</Button>
          <Button variant="secondary" onClick={() => act("pdf", () => comparisonApi.downloadPdf(c.id))} loading={busy === "pdf"}><FileDown className="size-4" aria-hidden /> PDF report</Button>
          <Button variant="secondary" onClick={() => act("json", () => comparisonApi.downloadJson(c.id))} loading={busy === "json"}><FileJson className="size-4" aria-hidden /> Export JSON</Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete comparison"><Trash2 className="size-4" aria-hidden /></Button>
        </div>
      </header>

      {!c.saved && (
        <Alert tone="warning" className="mb-6" title={params.get("fresh") ? "Analysis complete — this is an unsaved draft" : "This is an unsaved draft"}
          action={<Button size="sm" onClick={save} loading={busy === "save"}><Bookmark className="size-4" aria-hidden /> Save to history</Button>}>
          Save it to keep it in your history and dashboard. Unsaved drafts are deleted automatically after 24 hours.
        </Alert>
      )}
      {r.warnings.length > 0 && (
        <Alert tone="info" className="mb-6" title="Notes about the inputs">
          <ul className="list-disc space-y-1 pl-5">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      )}

      <div className="lg:grid lg:grid-cols-[1fr_13rem] lg:gap-10">
        <div className="min-w-0 space-y-14">
          <section id="overview" aria-labelledby="overview-title" className="scroll-mt-24">
            <h2 id="overview-title" className="sr-only">Overview</h2>
            <div className="card grid gap-8 p-6 md:grid-cols-[auto_1fr] md:p-8">
              <div className="flex flex-col items-center gap-3">
                <ScoreRing score={c.overallScore} band={c.scoreBand} />
                <Badge className={band.badge}>{band.label}</Badge>
              </div>
              <div>
                <p className="font-display text-xl leading-relaxed">{r.summary}</p>
                <p className="mt-3 text-sm text-muted">{band.description}</p>
                <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {(["matched", "partial", "missing", "review"] as const).map((s) => (
                    <div key={s} className="rounded-xl bg-paper/70 p-3 ring-1 ring-line">
                      <dt className="text-xs text-muted">{COUNT_LABELS[s]}</dt>
                      <dd className="font-display text-2xl font-semibold">{counts[s] ?? 0}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 rounded-xl bg-sage-50 p-3 text-xs leading-relaxed text-sage-800 ring-1 ring-sage-100">
                  This score measures how well the resume text aligns with this job description. It is not a probability of being interviewed or hired.
                </p>
              </div>
            </div>
            <div className="card mt-6 p-6 md:p-8">
              <SectionTitle title="How the score was calculated" description="Each component is scored 0–100, multiplied by its weight, and summed." />
              <ComponentBreakdown components={r.components} />
            </div>
          </section>

          <section id="skills" aria-labelledby="skills-title" className="scroll-mt-24">
            <SectionTitle id="skills-title" index="01" title="Skill evidence" description="Every requirement with the resume line that supports it. Missing means the resume does not show it — not that you lack it." />
            <SkillFindings matches={r.skillMatches} />
          </section>

          <section id="projects" aria-labelledby="projects-title" className="scroll-mt-24">
            <SectionTitle id="projects-title" index="02" title="Most relevant projects" description="Ranked by the requirements each project demonstrates and its semantic closeness to the role." />
            <ProjectList projects={r.projects} />
          </section>

          <section id="qualifications" aria-labelledby="qual-title" className="scroll-mt-24">
            <SectionTitle id="qual-title" index="03" title="Experience & qualifications" />
            <Qualifications result={r} />
          </section>

          <section id="evidence" aria-labelledby="evidence-title" className="scroll-mt-24">
            <SectionTitle id="evidence-title" index="04" title="Supporting evidence" description="Closest resume line for each job statement, by cosine similarity of sentence embeddings." />
            <Alignments alignments={r.alignments} />
          </section>

          <section id="recommendations" aria-labelledby="rec-title" className="scroll-mt-24">
            <SectionTitle id="rec-title" index="05" title="Recommendations" description="Grounded in this resume and job description only." />
            <Recommendations items={r.recommendations} />
          </section>

          <section id="methodology" aria-labelledby="method-title" className="scroll-mt-24">
            <SectionTitle id="method-title" index="06" title="Methodology & limitations" />
            <div className="card space-y-6 p-6">
              <div>
                <p className="eyebrow">Calculation</p>
                <ul className="mt-2 space-y-1 font-mono text-xs leading-relaxed text-ink-soft">{r.calculation.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {r.methodology.map((m) => (
                  <div key={m.title}><p className="font-medium">{m.title}</p><p className="mt-1 text-sm leading-relaxed text-ink-soft">{m.body}</p></div>
                ))}
              </div>
              <div>
                <p className="eyebrow">Limitations</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
              <dl className="grid gap-3 border-t border-line pt-4 text-xs text-muted sm:grid-cols-2">
                <div><dt className="inline">Scoring version: </dt><dd className="inline font-medium text-ink">{c.scoringVersion}</dd></div>
                <div><dt className="inline">Analysis version: </dt><dd className="inline font-medium text-ink">{c.analysisVersion}</dd></div>
                <div><dt className="inline">Skill taxonomy: </dt><dd className="inline font-medium text-ink">{c.taxonomyVersion}</dd></div>
                <div><dt className="inline">Embedding model: </dt><dd className="inline font-medium text-ink">{c.modelName} ({r.model.dimension} dimensions)</dd></div>
                <div className="sm:col-span-2"><dt className="inline">Input fingerprint: </dt><dd className="inline break-all font-mono text-ink">{r.inputFingerprint.slice(0, 16)}…</dd></div>
              </dl>
            </div>
            <details className="card mt-4 p-6">
              <summary className="cursor-pointer font-medium">Job description used for this analysis</summary>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-soft">{c.jobDescription}</pre>
            </details>
          </section>
        </div>

        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-8">
            <p className="eyebrow">On this page</p>
            <ul className="mt-3 space-y-1 border-l border-line">
              {SECTIONS.map(([sid, label]) => (
                <li key={sid}><a href={`#${sid}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-sm text-muted hover:border-sage-600 hover:text-ink">{label}</a></li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <RenameDialog key={c.updatedAt} comparison={c} open={renaming} onClose={() => setRenaming(false)} onSaved={(u) => { setData(u); toast.success("Comparison updated."); }} />
      <ConfirmDialog open={confirmDelete} title="Delete this comparison?" description="The analysis, its evidence and its report will be permanently deleted." confirmLabel="Delete comparison" onConfirm={remove} onClose={() => setConfirmDelete(false)} loading={busy === "delete"} />
    </>
  );
}
