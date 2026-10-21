import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, FileDown, FileJson, FolderOpen, Pencil, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { ApiError } from "../api/client";
import { comparisonApi } from "../api/endpoints";
import type { ComparisonSummary } from "../api/types";
import { ConfirmDialog, Dialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { Alert, Badge, Button, EmptyState, Field, LinkButton, PageHeader, Select, Spinner, TextInput } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { readQuery } from "../lib/comparisonQuery";
import { BAND_META, formatDate, formatScore } from "../lib/format";

const SORTS = [
  ["createdAt,desc", "Newest first"],
  ["createdAt,asc", "Oldest first"],
  ["overallScore,desc", "Highest score"],
  ["overallScore,asc", "Lowest score"],
  ["name,asc", "Name A–Z"],
  ["jobTitle,asc", "Job title A–Z"],
] as const;
function RenameDialog({ item, onClose, onSaved }: { item: ComparisonSummary | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    try {
      await comparisonApi.update(item.id, { name: name.trim() });
      toast.success("Comparison renamed.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rename failed.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={item !== null} title="Rename comparison" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Name" error={error ?? undefined}>{(a) => <TextInput {...a} value={name} maxLength={150} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save name</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ComparisonsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const query = readQuery(params);
  const key = params.toString();
  const { data, error, loading, reload } = useApi(() => comparisonApi.list(query), [key]);
  const [search, setSearch] = useState(query.q ?? "");
  const [showFilters, setShowFilters] = useState(Boolean(query.jobTitle || query.minScore !== undefined || query.maxScore !== undefined || query.from || query.to));
  const [renaming, setRenaming] = useState<ComparisonSummary | null>(null);
  const [deleting, setDeleting] = useState<ComparisonSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [filterKey, setFilterKey] = useState(0);

  const update = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };

  // Debounce free-text search into the URL.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((query.q ?? "") !== search.trim()) update({ q: search.trim() || undefined });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const download = async (id: string, kind: "pdf" | "json") => {
    setBusyId(id + kind);
    try {
      await (kind === "pdf" ? comparisonApi.downloadPdf(id) : comparisonApi.downloadJson(id));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Download failed.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await comparisonApi.remove(deleting.id);
      toast.success(`Deleted “${deleting.name}”.`);
      setDeleting(null);
      if (data && data.content.length === 1 && (query.page ?? 0) > 0) update({ page: String((query.page ?? 1) - 1) }, false);
      else await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const hasFilters = Boolean(query.q || query.jobTitle || query.minScore !== undefined || query.maxScore !== undefined || query.from || query.to);
  const page = data?.page ?? 0;

  return (
    <>
      <PageHeader eyebrow="History" title="Saved comparisons" description="Search, filter and export the analyses you chose to keep." actions={<LinkButton to="/app/analyze">New analysis</LinkButton>} />

      <section className="card mb-6 p-4" aria-label="Search and filters">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <label htmlFor="search" className="sr-only">Search by name, job title or company</label>
            <TextInput id="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, job title or company" className="pl-10" maxLength={100} />
          </div>
          <label htmlFor="sort" className="sr-only">Sort</label>
          <Select id="sort" value={query.sort} onChange={(e) => update({ sort: e.target.value })} className="md:w-48">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="filters"><SlidersHorizontal className="size-4" aria-hidden /> Filters</Button>
        </div>
        {showFilters && (
          <div id="filters" key={filterKey} className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Job title contains">{(a) => <TextInput {...a} defaultValue={query.jobTitle} maxLength={100} onBlur={(e) => update({ jobTitle: e.target.value.trim() || undefined })} onKeyDown={(e) => e.key === "Enter" && update({ jobTitle: e.currentTarget.value.trim() || undefined })} />}</Field>
            <Field label="Min score">{(a) => <TextInput {...a} type="number" min={0} max={100} defaultValue={query.minScore} onBlur={(e) => update({ minScore: e.target.value || undefined })} />}</Field>
            <Field label="Max score">{(a) => <TextInput {...a} type="number" min={0} max={100} defaultValue={query.maxScore} onBlur={(e) => update({ maxScore: e.target.value || undefined })} />}</Field>
            <Field label="From date">{(a) => <TextInput {...a} type="date" value={query.from ?? ""} onChange={(e) => update({ from: e.target.value || undefined })} />}</Field>
            <Field label="To date">{(a) => <TextInput {...a} type="date" value={query.to ?? ""} onChange={(e) => update({ to: e.target.value || undefined })} />}</Field>
          </div>
        )}
        {hasFilters && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <p className="text-muted">{data ? `${data.totalElements} result${data.totalElements === 1 ? "" : "s"}` : "Searching…"}</p>
            <button type="button" className="font-medium text-sage-700 hover:underline" onClick={() => { setSearch(""); setFilterKey((k) => k + 1); setParams(new URLSearchParams(query.sort && query.sort !== "createdAt,desc" ? { sort: query.sort } : {}), { replace: true }); }}>Clear filters</button>
          </div>
        )}
      </section>

      {error && <Alert tone="danger" title="Comparisons could not be loaded" action={<Button size="sm" variant="secondary" onClick={reload}>Try again</Button>}>{error.message}</Alert>}
      {loading && !data && <Spinner label="Loading comparisons" />}
      {data && data.totalElements === 0 && (
        hasFilters ? (
          <EmptyState icon={<Search className="size-7" aria-hidden />} title="No comparisons match these filters">Try a broader search or clear the filters.</EmptyState>
        ) : (
          <EmptyState icon={<FolderOpen className="size-7" aria-hidden />} title="Nothing saved yet" action={<LinkButton to="/app/analyze">Run your first analysis</LinkButton>}>
            After an analysis finishes, choose “Save comparison” to keep it here. Unsaved drafts are removed after 24 hours.
          </EmptyState>
        )
      )}

      {data && data.content.length > 0 && (
        <>
          <ul className={`space-y-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            {data.content.map((c) => (
              <li key={c.id} className="card flex flex-col gap-4 p-5 md:flex-row md:items-center">
                <Link to={`/app/comparisons/${c.id}`} className="flex min-w-0 flex-1 items-center gap-5 rounded-xl">
                  <span className="w-14 text-center">
                    <span className="block font-display text-3xl font-semibold tabular-nums text-sage-700">{formatScore(c.overallScore)}</span>
                    <span className="block text-[0.65rem] uppercase tracking-wide text-muted">score</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-semibold hover:underline">{c.name}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {[c.jobTitle, c.company].filter(Boolean).join(" · ") || "No job title"} · {c.resumeTitle ?? "Deleted resume"} · {formatDate(c.savedAt ?? c.createdAt)}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <Badge className={BAND_META[c.scoreBand].badge}>{BAND_META[c.scoreBand].label}</Badge>
                      <Badge className="bg-paper text-muted ring-line">Scoring v{c.scoringVersion}</Badge>
                    </span>
                  </span>
                </Link>
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(c)} aria-label={`Rename ${c.name}`}><Pencil className="size-4" aria-hidden /></Button>
                  <Button size="sm" variant="secondary" onClick={() => download(c.id, "pdf")} loading={busyId === c.id + "pdf"} aria-label={`Download PDF report for ${c.name}`}><FileDown className="size-4" aria-hidden /> PDF</Button>
                  <Button size="sm" variant="secondary" onClick={() => download(c.id, "json")} loading={busyId === c.id + "json"} aria-label={`Export JSON for ${c.name}`}><FileJson className="size-4" aria-hidden /> JSON</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
          {data.totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
              <p className="text-sm text-muted">Page {page + 1} of {data.totalPages} · {data.totalElements} comparisons</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => update({ page: String(page - 1) }, false)}><ChevronLeft className="size-4" aria-hidden /> Previous</Button>
                <Button variant="secondary" size="sm" disabled={page + 1 >= data.totalPages} onClick={() => update({ page: String(page + 1) }, false)}>Next <ChevronRight className="size-4" aria-hidden /></Button>
              </div>
            </nav>
          )}
        </>
      )}

      <RenameDialog key={renaming?.id ?? "closed"} item={renaming} onClose={() => setRenaming(null)} onSaved={reload} />
      <ConfirmDialog open={deleting !== null} title="Delete this comparison?" description={<>“{deleting?.name}” and its report will be permanently deleted.</>} confirmLabel="Delete comparison" onConfirm={confirmDelete} onClose={() => setDeleting(null)} loading={deleteBusy} />
    </>
  );
}
