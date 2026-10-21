import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { ClipboardPaste, FileText, FileUp, Pencil, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { ApiError } from "../api/client";
import { resumeApi } from "../api/endpoints";
import type { ResumeSummary } from "../api/types";
import { ConfirmDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { Alert, Badge, Button, EmptyState, Field, LinkButton, PageHeader, Spinner, TextArea, TextInput } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { cn, formatDate, plural } from "../lib/format";
import { RESUME_MAX_CHARS, resumeTextSchema, type ResumeTextValues, validatePdfFile } from "../lib/validation";
import { applyFieldErrors } from "../lib/forms";

const NO_TEXT_CODES = new Set(["IMAGE_ONLY_DOCUMENT", "NO_TEXT_FOUND", "EMPTY_DOCUMENT"]);

function UploadPanel({ onPasteInstead }: { onPasteInstead: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<ApiError | { code: string; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const choose = (f: File | undefined) => {
    if (!f) return;
    const problem = validatePdfFile(f);
    setError(problem ? { code: "CLIENT_VALIDATION", message: problem } : null);
    setFile(problem ? null : f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const resume = await resumeApi.upload(file, title.trim() || undefined);
      navigate(`/app/resumes/${resume.id}?new=1`);
    } catch (e) {
      setError(e instanceof ApiError ? e : { code: "UNKNOWN", message: "Upload failed. Please try again." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
        className={cn("flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-sage-500 bg-sage-50" : "border-line-strong bg-paper/50")}
      >
        <UploadCloud className="size-9 text-sage-600" aria-hidden />
        <p className="mt-3 font-medium">{file ? file.name : "Drag a PDF here"}</p>
        <p className="mt-1 text-xs text-muted">{file ? `${(file.size / 1024).toFixed(0)} KB · ready to upload` : "Text-based PDF, up to 5 MB and 12 pages"}</p>
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="sr-only" id="resume-file" onChange={(e) => choose(e.target.files?.[0])} />
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
          <FileUp className="size-4" aria-hidden /> {file ? "Choose a different file" : "Choose file"}
        </Button>
      </div>
      <Field label="Title" optional hint="Defaults to the file name.">
        {(a) => <TextInput {...a} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Backend internship resume" />}
      </Field>
      {error && (
        <Alert
          tone={NO_TEXT_CODES.has(error.code) ? "warning" : "danger"}
          title={NO_TEXT_CODES.has(error.code) ? "No readable text in this PDF" : "Upload not accepted"}
          action={NO_TEXT_CODES.has(error.code) || error.code === "ENCRYPTED_DOCUMENT" || error.code === "MALFORMED_DOCUMENT"
            ? <Button size="sm" variant="secondary" onClick={onPasteInstead}><ClipboardPaste className="size-4" aria-hidden /> Paste text instead</Button>
            : undefined}
        >
          {error.message}
          {NO_TEXT_CODES.has(error.code) && " CareerLens does not run OCR on scanned images, so text must be selectable in the PDF."}
        </Alert>
      )}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs leading-relaxed text-muted">The PDF is processed in memory and not stored. You will review the extracted text next.</p>
        <Button onClick={upload} disabled={!file} loading={uploading}>Upload &amp; extract</Button>
      </div>
    </div>
  );
}

function PastePanel() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<ResumeTextValues>({
    resolver: zodResolver(resumeTextSchema),
    defaultValues: { title: "", content: "" },
  });
  const length = (useWatch({ control, name: "content" }) ?? "").length;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const resume = await resumeApi.createFromText(values);
      navigate(`/app/resumes/${resume.id}?new=1`);
    } catch (e) {
      if (!applyFieldErrors(e, setError, ["title", "content"])) setFormError(e instanceof ApiError ? e.message : "Saving failed.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Title" error={errors.title?.message}>
        {(a) => <TextInput {...a} {...register("title")} placeholder="e.g. Backend internship resume" />}
      </Field>
      <Field label="Resume text" error={errors.content?.message} hint={`${length.toLocaleString()} / ${RESUME_MAX_CHARS.toLocaleString()} characters. Keep section headings such as Skills, Projects and Experience on their own lines.`}>
        {(a) => <TextArea {...a} {...register("content")} rows={12} placeholder="Paste the full text of your resume" />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>Save &amp; review</Button>
      </div>
    </form>
  );
}

function ResumeCard({ resume, onDelete }: { resume: ResumeSummary; onDelete: () => void }) {
  return (
    <li className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-sage-50 p-2.5 text-sage-700 ring-1 ring-sage-200"><FileText className="size-5" aria-hidden /></div>
        <Badge className="bg-paper text-ink-soft ring-line-strong">{resume.sourceType === "PDF" ? `PDF · ${plural(resume.pageCount ?? 0, "page")}` : "Pasted text"}</Badge>
      </div>
      <h3 className="mt-4 line-clamp-2 text-lg font-semibold">{resume.title}</h3>
      <p className="mt-1 text-xs text-muted">{resume.charCount.toLocaleString()} characters · updated {formatDate(resume.updatedAt)}</p>
      <div className="mt-5 flex flex-wrap gap-2 pt-1">
        <LinkButton to={`/app/analyze?resume=${resume.id}`} size="sm"><Sparkles className="size-4" aria-hidden /> Analyse</LinkButton>
        <LinkButton to={`/app/resumes/${resume.id}`} size="sm" variant="secondary"><Pencil className="size-4" aria-hidden /> Review</LinkButton>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${resume.title}`}><Trash2 className="size-4" aria-hidden /></Button>
      </div>
    </li>
  );
}

export function ResumesPage() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi(() => resumeApi.list(), []);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [toDelete, setToDelete] = useState<ResumeSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await resumeApi.remove(toDelete.id);
      setData((list) => list?.filter((r) => r.id !== toDelete.id));
      toast.success(`Deleted “${toDelete.title}”.`);
      setToDelete(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Resumes" title="Your resumes" description="Upload a PDF or paste text. Each resume can be compared with any number of job descriptions." />
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <section className="card p-6" aria-labelledby="add-resume">
          <h2 id="add-resume" className="text-xl font-semibold">Add a resume</h2>
          <div role="tablist" aria-label="How to add a resume" className="mt-4 inline-flex rounded-full bg-paper p-1 ring-1 ring-line">
            {(["upload", "paste"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} aria-controls={`panel-${t}`} id={`tab-${t}`} onClick={() => setTab(t)}
                className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", tab === t ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
                {t === "upload" ? "Upload PDF" : "Paste text"}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
            {tab === "upload" ? <UploadPanel onPasteInstead={() => setTab("paste")} /> : <PastePanel />}
          </div>
        </section>

        <section aria-labelledby="your-resumes">
          <h2 id="your-resumes" className="sr-only">Saved resumes</h2>
          {loading && !data && <Spinner label="Loading resumes" />}
          {error && <Alert tone="danger" title="Resumes could not be loaded" action={<Button size="sm" variant="secondary" onClick={reload}>Try again</Button>}>{error.message}</Alert>}
          {data && data.length === 0 && (
            <EmptyState icon={<FileText className="size-7" aria-hidden />} title="No resumes yet">
              Your uploaded or pasted resumes will appear here. Only the text you approve is stored — never the original file.
            </EmptyState>
          )}
          {data && data.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {data.map((r) => <ResumeCard key={r.id} resume={r} onDelete={() => setToDelete(r)} />)}
            </ul>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this resume?"
        description={<>“{toDelete?.title}” will be permanently deleted. Saved comparisons made with it are kept, but will no longer link to the resume.</>}
        confirmLabel="Delete resume"
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
        loading={deleting}
      />
    </>
  );
}
