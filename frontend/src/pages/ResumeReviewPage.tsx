import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, CheckCircle2, CircleDashed, Sparkles, Trash2 } from "lucide-react";
import { ApiError } from "../api/client";
import { resumeApi } from "../api/endpoints";
import { ConfirmDialog, Dialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { Alert, Badge, Button, Field, LinkButton, PageHeader, Spinner, TextArea, TextInput } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { formatDateTime } from "../lib/format";
import { RESUME_MAX_CHARS, resumeTextSchema, type ResumeTextValues, wordCount } from "../lib/validation";
import { applyFieldErrors } from "../lib/forms";

export function ResumeReviewPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = params.get("new") === "1";
  const { data: resume, error, loading, setData } = useApi(() => resumeApi.get(id), [id]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { register, handleSubmit, reset, control, setError, formState: { errors, isDirty, isSubmitting } } = useForm<ResumeTextValues>({
    resolver: zodResolver(resumeTextSchema),
    defaultValues: { title: "", content: "" },
  });

  useEffect(() => {
    if (resume) reset({ title: resume.title, content: resume.content });
  }, [resume, reset]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && !isSubmitting && currentLocation.pathname !== nextLocation.pathname);
  const content = useWatch({ control, name: "content" }) ?? "";

  const save = async (values: ResumeTextValues) => {
    try {
      const updated = await resumeApi.update(id, values);
      setData(updated);
      reset({ title: updated.title, content: updated.content });
      toast.success("Resume saved.");
      return true;
    } catch (e) {
      if (!applyFieldErrors(e, setError, ["title", "content"])) toast.error(e instanceof ApiError ? e.message : "Saving failed.");
      return false;
    }
  };

  const onSave = handleSubmit(async (values) => { await save(values); });
  const onAnalyse = handleSubmit(async (values) => {
    if (isDirty && !(await save(values))) return;
    navigate(`/app/analyze?resume=${id}`);
  });

  const onDelete = async () => {
    setDeleting(true);
    try {
      await resumeApi.remove(id);
      reset({ title: resume?.title ?? "", content: resume?.content ?? "" });
      toast.success("Resume deleted.");
      navigate("/app/resumes", { replace: true });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed.");
      setDeleting(false);
    }
  };

  if (loading && !resume) return <Spinner label="Loading resume" />;
  if (error) {
    return (
      <Alert tone="danger" title={error.status === 404 ? "Resume not found" : "Resume could not be loaded"} action={<LinkButton to="/app/resumes" variant="secondary" size="sm">Back to resumes</LinkButton>}>
        {error.status === 404 ? "It may have been deleted, or it belongs to a different account." : error.message}
      </Alert>
    );
  }
  if (!resume) return null;
  const s = resume.structure;

  return (
    <>
      <LinkButton to="/app/resumes" variant="ghost" size="sm" className="-ml-3 mb-4"><ArrowLeft className="size-4" aria-hidden /> All resumes</LinkButton>
      <PageHeader
        eyebrow={isNew ? "Step 1 of 2 · Review extracted text" : "Resume"}
        title={resume.title}
        description={resume.sourceType === "PDF" ? `Extracted from ${resume.originalFilename ?? "a PDF"} (${resume.pageCount} page${resume.pageCount === 1 ? "" : "s"}). Last updated ${formatDateTime(resume.updatedAt)}.` : `Pasted text. Last updated ${formatDateTime(resume.updatedAt)}.`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" aria-hidden /> Delete</Button>
            <Button onClick={onAnalyse} loading={isSubmitting}><Sparkles className="size-4" aria-hidden /> {isDirty ? "Save & analyse" : "Analyse against a job"}</Button>
          </>
        }
      />
      {isNew && <Alert tone="info" className="mb-6" title="Check the text before analysing">{resume.sourceType === "PDF" ? "PDF extraction can merge columns or split lines. " : "Make sure section headings such as Skills, Projects and Experience sit on their own lines. "}Correct anything that looks wrong — the analysis only uses the text below.</Alert>}
      {resume.warnings.length > 0 && (
        <Alert tone="warning" className="mb-6" title="Extraction notes">
          <ul className="list-disc space-y-1 pl-5">{resume.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <form onSubmit={onSave} noValidate className="card space-y-5 p-6">
          <Field label="Title" error={errors.title?.message}>
            {(a) => <TextInput {...a} {...register("title")} />}
          </Field>
          <Field label="Resume text" error={errors.content?.message} hint={`${content.length.toLocaleString()} / ${RESUME_MAX_CHARS.toLocaleString()} characters · ${wordCount(content).toLocaleString()} words`}>
            {(a) => <TextArea {...a} {...register("content")} rows={26} className="font-mono text-[0.85rem]" spellCheck={false} />}
          </Field>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted" aria-live="polite">{isDirty ? "You have unsaved changes." : "All changes saved."}</p>
            <Button type="submit" variant="secondary" disabled={!isDirty} loading={isSubmitting}>Save changes</Button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="card p-5" aria-labelledby="sections-heading">
            <h2 id="sections-heading" className="text-base font-semibold">Detected sections</h2>
            {!s ? (
              <p className="mt-2 text-sm text-muted">Section detection is temporarily unavailable. Your text is saved and can still be analysed once the analysis engine is back.</p>
            ) : (
              <>
                <ul className="mt-3 space-y-1.5">
                  {s.detected.map((d) => <li key={d} className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-sage-600" aria-hidden /> {d}</li>)}
                  {s.missing.map((m) => <li key={m} className="flex items-center gap-2 text-sm text-muted"><CircleDashed className="size-4" aria-hidden /> {m} <span className="text-xs">(not found)</span></li>)}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-muted">Headings on their own line are detected most reliably. Missing sections are not errors — they simply cannot contribute evidence.</p>
              </>
            )}
          </section>
          {s && s.skills.length > 0 && (
            <section className="card p-5" aria-labelledby="skills-heading">
              <h2 id="skills-heading" className="text-base font-semibold">Skills recognised</h2>
              <p className="mt-1 text-xs text-muted">Matched against the skill taxonomy ({s.skills.length}).</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{s.skills.map((k) => <Badge key={k} className="bg-sage-50 text-sage-800 ring-sage-200">{k}</Badge>)}</div>
            </section>
          )}
          {s && (s.projects.length > 0 || s.experience.length > 0) && (
            <section className="card p-5" aria-labelledby="entries-heading">
              <h2 id="entries-heading" className="text-base font-semibold">Entries found</h2>
              {s.projects.length > 0 && <><p className="eyebrow mt-3">Projects</p><ul className="mt-1.5 space-y-1 text-sm">{s.projects.map((p) => <li key={p.title} className="truncate">{p.title}</li>)}</ul></>}
              {s.experience.length > 0 && <><p className="eyebrow mt-4">Experience</p><ul className="mt-1.5 space-y-1 text-sm">{s.experience.map((p) => <li key={p.title} className="truncate">{p.title}</li>)}</ul></>}
            </section>
          )}
        </aside>
      </div>

      <ConfirmDialog open={confirmDelete} title="Delete this resume?" description="The resume text is permanently deleted. Saved comparisons are kept." confirmLabel="Delete resume" onConfirm={onDelete} onClose={() => setConfirmDelete(false)} loading={deleting} />
      <Dialog
        open={blocker.state === "blocked"}
        title="Discard unsaved changes?"
        description="You edited this resume but did not save. Leaving now discards those edits."
        onClose={() => blocker.reset?.()}
        footer={<><Button variant="secondary" onClick={() => blocker.reset?.()}>Keep editing</Button><Button variant="danger" onClick={() => blocker.proceed?.()}>Discard changes</Button></>}
      />
    </>
  );
}
