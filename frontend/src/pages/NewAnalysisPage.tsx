import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, FileText, Loader2, Plus, Sparkles, X } from "lucide-react";
import { ApiError } from "../api/client";
import { analysisApi, jobApi, resumeApi } from "../api/endpoints";
import type { Importance, JobRequirements } from "../api/types";
import { Alert, Badge, Button, EmptyState, Field, LinkButton, PageHeader, Spinner, TextArea, TextInput } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { cn, formatDate } from "../lib/format";
import { type EditableRequirement, MAX_REQUIREMENTS, nextKey, toEditable } from "../lib/requirements";
import { JD_MAX_CHARS, jobDescriptionSchema, type JobDescriptionValues } from "../lib/validation";

type Step = "resume" | "job" | "review" | "running";

const STEP_LABELS: { id: Exclude<Step, "running">; label: string }[] = [
  { id: "resume", label: "Resume" },
  { id: "job", label: "Job description" },
  { id: "review", label: "Requirements" },
];

function Stepper({ step }: { step: Step }) {
  const order = ["resume", "job", "review", "running"];
  const current = order.indexOf(step);
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
      {STEP_LABELS.map((s, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li key={s.id} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold ring-1",
              done ? "bg-sage-600 text-paper ring-sage-600" : active ? "bg-mustard-200 text-ink ring-mustard-500" : "bg-surface text-muted ring-line-strong")}>
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn(active ? "font-medium text-ink" : "text-muted")}>{s.label}</span>
            {i < STEP_LABELS.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong sm:w-10" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function RequirementEditor({ items, onChange }: { items: EditableRequirement[]; onChange: (items: EditableRequirement[]) => void }) {
  const [newSkill, setNewSkill] = useState("");
  const [newImportance, setNewImportance] = useState<Importance>("required");
  const [addError, setAddError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<EditableRequirement>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));
  const add = () => {
    const name = newSkill.trim();
    if (!name) return setAddError("Enter a skill name.");
    if (name.length > 80) return setAddError("Skill names must be at most 80 characters.");
    if (items.some((i) => i.skill.toLowerCase() === name.toLowerCase())) return setAddError(`“${name}” is already in the list.`);
    if (items.length >= MAX_REQUIREMENTS) return setAddError(`At most ${MAX_REQUIREMENTS} requirements can be analysed.`);
    onChange([...items, { key: nextKey(), skill: name, importance: newImportance, alternatives: [], category: "Added by you", evidence: "", custom: true }]);
    setNewSkill("");
    setAddError(null);
  };

  const groups: { importance: Importance; title: string; note: string }[] = [
    { importance: "required", title: "Required", note: "Weighted most heavily. Move anything the posting marks as optional to Preferred." },
    { importance: "preferred", title: "Preferred", note: "Nice-to-have skills; they cannot outweigh required ones." },
  ];

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const list = items.filter((i) => i.importance === g.importance);
        return (
          <section key={g.importance} aria-label={`${g.title} skills`}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-lg font-semibold">{g.title} <span className="font-sans text-sm font-normal text-muted">({list.length})</span></h3>
              <p className="hidden text-xs text-muted sm:block">{g.note}</p>
            </div>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-muted">No {g.title.toLowerCase()} skills.</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {list.map((item) => (
                  <li key={item.key} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.skill}</span>
                        <Badge className="bg-paper text-muted ring-line">{item.category}</Badge>
                        {item.alternatives.length > 0 && <span className="text-xs text-muted">or {item.alternatives.join(", ")}</span>}
                      </div>
                      {item.evidence && <p className="prose-evidence mt-1 line-clamp-2 text-sm">“{item.evidence}”</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-full bg-paper p-0.5 ring-1 ring-line" role="group" aria-label={`Importance of ${item.skill}`}>
                        {(["required", "preferred"] as const).map((imp) => (
                          <button key={imp} type="button" aria-pressed={item.importance === imp} onClick={() => update(item.key, { importance: imp })}
                            className={cn("rounded-full px-3 py-1 text-xs font-medium", item.importance === imp ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
                            {imp === "required" ? "Required" : "Preferred"}
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => remove(item.key)} className="rounded-full p-1.5 text-muted hover:bg-clay-50 hover:text-clay-700" aria-label={`Remove ${item.skill}`}>
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <div className="rounded-2xl bg-paper/70 p-4 ring-1 ring-line">
        <p className="text-sm font-medium">Add a requirement the extractor missed</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="new-skill">Skill name</label>
          <TextInput id="new-skill" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="e.g. GraphQL" maxLength={80} aria-invalid={Boolean(addError)} className="sm:flex-1" />
          <label className="sr-only" htmlFor="new-importance">Importance</label>
          <select id="new-importance" className="input sm:w-36" value={newImportance} onChange={(e) => setNewImportance(e.target.value as Importance)}>
            <option value="required">Required</option>
            <option value="preferred">Preferred</option>
          </select>
          <Button variant="secondary" onClick={add}><Plus className="size-4" aria-hidden /> Add</Button>
        </div>
        {addError && <p className="mt-2 text-xs font-medium text-clay-700" role="alert">{addError}</p>}
        <p className="mt-2 text-xs text-muted">Skills outside the taxonomy are matched by exact name only.</p>
      </div>
    </div>
  );
}

function Progress({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);
  const seconds = ((now - startedAt) / 1000).toFixed(1);
  return (
    <section className="card mx-auto max-w-2xl p-8 text-center" aria-live="polite" aria-busy="true">
      <Loader2 className="mx-auto size-10 animate-spin text-sage-600" aria-hidden />
      <h2 className="mt-5 text-2xl font-semibold">Analysing your resume against this role</h2>
      <p className="mt-2 text-sm text-muted">Elapsed {seconds}s · usually a few seconds</p>
      <div className="mx-auto mt-6 h-1.5 max-w-sm overflow-hidden rounded-full bg-paper" aria-hidden>
        <div className="animate-indeterminate h-full w-2/5 rounded-full bg-sage-500" />
      </div>
      <div className="mt-8 rounded-2xl bg-paper/70 p-5 text-left text-sm ring-1 ring-line">
        <p className="font-medium">What happens during this request</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
          <li>Each requirement is looked up in your resume using the skill taxonomy and its aliases.</li>
          <li>Job statements are embedded with a local sentence-transformer model and compared with your resume lines.</li>
          <li>Projects are ranked by the requirements they demonstrate; the six score components are combined.</li>
          <li>The result is stored as a draft that you can review and then save.</li>
        </ul>
      </div>
      <Button variant="secondary" className="mt-6" onClick={onCancel}>Stop waiting</Button>
      <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted">
        Stopping only stops this page from waiting. If the server already finished, an unsaved draft may exist; drafts you do not save are deleted automatically after 24 hours.
      </p>
    </section>
  );
}

export function NewAnalysisPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resumes = useApi(() => resumeApi.list(), []);
  const [step, setStep] = useState<Step>("resume");
  const [resumeId, setResumeId] = useState<string | null>(params.get("resume"));
  const [job, setJob] = useState<JobRequirements | null>(null);
  const [requirements, setRequirements] = useState<EditableRequirement[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const form = useForm<JobDescriptionValues>({
    resolver: zodResolver(jobDescriptionSchema),
    defaultValues: { jobTitle: "", company: "", jobDescription: "" },
  });
  const jdLength = (useWatch({ control: form.control, name: "jobDescription" }) ?? "").length;

  // Arriving from "Save & analyse" (?resume=id): once the list confirms the resume exists, skip straight to the job step.
  const [presetHandled, setPresetHandled] = useState(false);
  if (!presetHandled && resumes.data) {
    setPresetHandled(true);
    const preset = params.get("resume");
    if (preset && resumes.data.some((r) => r.id === preset)) setStep((s) => (s === "resume" ? "job" : s));
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectedResume = useMemo(() => resumes.data?.find((r) => r.id === resumeId) ?? null, [resumes.data, resumeId]);

  const extract = form.handleSubmit(async (values) => {
    setExtracting(true);
    setError(null);
    try {
      const result = await jobApi.extract(values.jobDescription);
      setJob(result);
      setRequirements(toEditable(result));
      if (!values.jobTitle && result.suggestedTitle) form.setValue("jobTitle", result.suggestedTitle.slice(0, 150));
      setStep("review");
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "Extraction failed."));
    } finally {
      setExtracting(false);
    }
  });

  const run = async () => {
    if (!resumeId) return;
    const values = form.getValues();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStartedAt(Date.now());
    setStep("running");
    try {
      const result = await analysisApi.run({
        resumeId,
        jobDescription: values.jobDescription.trim(),
        jobTitle: values.jobTitle.trim() || undefined,
        company: values.company.trim() || undefined,
        requirements: requirements.map(({ skill, importance, alternatives }) => ({ skill, importance, alternatives })),
      }, controller.signal);
      navigate(`/app/comparisons/${result.id}?fresh=1`);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "The analysis failed.");
      if (err.code !== "CANCELLED") setError(err);
      setStep("review");
    }
  };

  if (resumes.loading && !resumes.data) return <Spinner label="Loading your resumes" />;
  if (resumes.error) return <Alert tone="danger" title="Resumes could not be loaded" action={<Button size="sm" variant="secondary" onClick={resumes.reload}>Try again</Button>}>{resumes.error.message}</Alert>;
  if (resumes.data && resumes.data.length === 0) {
    return (
      <>
        <PageHeader eyebrow="New analysis" title="Compare a resume with a job" />
        <EmptyState icon={<FileText className="size-7" aria-hidden />} title="Add a resume first" action={<LinkButton to="/app/resumes">Add a resume</LinkButton>}>
          An analysis needs one resume and one job description. Upload a PDF or paste your resume text to begin.
        </EmptyState>
      </>
    );
  }

  const requiredCount = requirements.filter((r) => r.importance === "required").length;

  return (
    <>
      <PageHeader eyebrow="New analysis" title="Compare a resume with a job" description="Choose a resume, paste the job description, check the extracted requirements, then run the analysis." />
      <Stepper step={step} />

      {error && (
        <Alert tone="danger" className="mb-6" title={error.code === "AI_SERVICE_UNAVAILABLE" || error.code === "AI_SERVICE_TIMEOUT" ? "The analysis engine could not complete this request" : "Something needs attention"}>
          {error.message}
          {error.fieldErrors.length > 0 && <ul className="mt-2 list-disc pl-5">{error.fieldErrors.map((f) => <li key={f.field + f.message}>{f.message}</li>)}</ul>}
        </Alert>
      )}

      {step === "resume" && (
        <section className="card p-6" aria-labelledby="choose-resume">
          <h2 id="choose-resume" className="text-xl font-semibold">Which resume should be analysed?</h2>
          <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Resume</legend>
            {resumes.data?.map((r) => (
              <label key={r.id} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                resumeId === r.id ? "border-sage-500 bg-sage-50 ring-2 ring-sage-200" : "border-line bg-surface hover:border-line-strong")}>
                <input type="radio" name="resume" value={r.id} checked={resumeId === r.id} onChange={() => setResumeId(r.id)} className="mt-1 accent-sage-700" />
                <span className="min-w-0">
                  <span className="block font-medium">{r.title}</span>
                  <span className="block text-xs text-muted">{r.sourceType === "PDF" ? "PDF" : "Pasted text"} · {r.charCount.toLocaleString()} characters · updated {formatDate(r.updatedAt)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mt-6 flex items-center justify-between">
            <Link to="/app/resumes" className="text-sm font-medium text-sage-700 hover:underline">Add another resume</Link>
            <Button onClick={() => setStep("job")} disabled={!resumeId}>Continue <ArrowRight className="size-4" aria-hidden /></Button>
          </div>
        </section>
      )}

      {step === "job" && (
        <form onSubmit={extract} noValidate className="card space-y-5 p-6" aria-labelledby="job-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="job-heading" className="text-xl font-semibold">Paste the job description</h2>
            {selectedResume && <p className="text-sm text-muted">Resume: <span className="font-medium text-ink">{selectedResume.title}</span> · <button type="button" className="underline underline-offset-2" onClick={() => setStep("resume")}>change</button></p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title" optional error={form.formState.errors.jobTitle?.message} hint="Filled from the posting if left empty.">
              {(a) => <TextInput {...a} {...form.register("jobTitle")} placeholder="e.g. Java Backend Developer Intern" />}
            </Field>
            <Field label="Company" optional error={form.formState.errors.company?.message}>
              {(a) => <TextInput {...a} {...form.register("company")} placeholder="e.g. Northwind Fintech" />}
            </Field>
          </div>
          <Field label="Job description" error={form.formState.errors.jobDescription?.message} hint={`${jdLength.toLocaleString()} / ${JD_MAX_CHARS.toLocaleString()} characters. Include the requirements and responsibilities sections.`}>
            {(a) => <TextArea {...a} {...form.register("jobDescription")} rows={16} placeholder="Paste the full job posting here" />}
          </Field>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep("resume")}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
            <Button type="submit" loading={extracting}>Extract requirements <ArrowRight className="size-4" aria-hidden /></Button>
          </div>
        </form>
      )}

      {step === "review" && job && (
        <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
          <section className="card p-6" aria-labelledby="review-heading">
            <h2 id="review-heading" className="text-xl font-semibold">Check the extracted skill requirements</h2>
            <p className="mt-1 text-sm text-muted">Change importance, remove anything that is not really required, or add what was missed. Only this list is scored as skill coverage.</p>
            {job.warnings.length > 0 && (
              <Alert tone="warning" className="mt-4" title="About this job description">
                <ul className="list-disc space-y-1 pl-5">{job.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </Alert>
            )}
            <div className="mt-6"><RequirementEditor items={requirements} onChange={setRequirements} /></div>
          </section>
          <aside className="space-y-4">
            <section className="card p-5">
              <h3 className="text-base font-semibold">Also assessed from the posting</h3>
              <dl className="mt-3 space-y-3 text-sm">
                <div><dt className="text-muted">Responsibilities</dt><dd className="font-medium">{job.responsibilities.length} statements</dd></div>
                <div><dt className="text-muted">Competencies</dt><dd className="font-medium">{job.competencies.length ? job.competencies.map((c) => c.skill).join(", ") : "None detected"}</dd></div>
                <div><dt className="text-muted">Experience</dt><dd className="font-medium">{job.experience.length ? job.experience.map((e) => e.text).join("; ") : "No years stated"}</dd></div>
                <div><dt className="text-muted">Education</dt><dd className="font-medium">{job.education.length ? job.education.join("; ") : "Not specified"}</dd></div>
                <div><dt className="text-muted">Certifications</dt><dd className="font-medium">{job.certifications.length ? job.certifications.join("; ") : "Not specified"}</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-muted">Education and certifications are listed for manual review and do not change the numeric score.</p>
            </section>
            <section className="card p-5">
              <p className="text-sm"><span className="font-semibold">{requirements.length}</span> skills · {requiredCount} required</p>
              <Button className="mt-4 w-full" size="lg" onClick={run} disabled={requirements.length === 0 || requirements.length > MAX_REQUIREMENTS}>
                <Sparkles className="size-4" aria-hidden /> Run analysis
              </Button>
              {requirements.length === 0 && <p className="mt-2 text-xs text-clay-700">Keep or add at least one skill to analyse.</p>}
              <Button variant="ghost" className="mt-2 w-full" onClick={() => setStep("job")}><ArrowLeft className="size-4" aria-hidden /> Edit job description</Button>
            </section>
          </aside>
        </div>
      )}

      {step === "running" && <Progress startedAt={startedAt} onCancel={() => abortRef.current?.abort()} />}
    </>
  );
}
