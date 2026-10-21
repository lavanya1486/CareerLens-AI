import { ArrowRight, FilePlus2, FileText, FolderOpen, TrendingUp } from "lucide-react";
import { Link } from "react-router";
import { dashboardApi } from "../api/endpoints";
import type { Dashboard, ScoreBand } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { DemandChart } from "../components/charts/DemandChart";
import { TrendChart } from "../components/charts/TrendChart";
import { Alert, Badge, Button, EmptyState, LinkButton, PageHeader, Spinner } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { BAND_META, formatDate, formatScore, plural } from "../lib/format";

const BAND_ORDER: ScoreBand[] = ["strong", "good", "partial", "limited"];

function Stat({ label, value, detail }: { label: string; value: string; detail?: React.ReactNode }) {
  return (
    <div className="card min-w-0 p-4 sm:p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">{value}</p>
      {detail && <div className="mt-1 truncate text-xs text-muted">{detail}</div>}
    </div>
  );
}

function Panel({ title, description, children, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-6 ${className ?? ""}`} aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BandDistribution({ bands, total }: { bands: Dashboard["scoreBands"]; total: number }) {
  const counts = new Map(bands.map((b) => [b.band, b.count]));
  return (
    <ul className="space-y-3">
      {BAND_ORDER.map((band) => {
        const count = counts.get(band) ?? 0;
        const pct = total ? (count / total) * 100 : 0;
        return (
          <li key={band}>
            <div className="flex justify-between text-sm">
              <span>{BAND_META[band].label}</span>
              <span className="tabular-nums text-muted">{count}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BAND_META[band].bar }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(() => dashboardApi.get(), []);
  const firstName = user?.fullName.split(" ")[0] ?? "";

  if (loading && !data) return <Spinner label="Loading your dashboard" />;
  if (error) {
    return <Alert tone="danger" title="The dashboard could not be loaded" action={<Button variant="secondary" size="sm" onClick={reload}>Try again</Button>}>{error.message}</Alert>;
  }
  if (!data) return null;

  const header = (
    <PageHeader
      eyebrow="Dashboard"
      title={firstName ? `Good to see you, ${firstName}` : "Dashboard"}
      description="Figures below are calculated from the comparisons you have saved."
      actions={<LinkButton to="/app/analyze"><FilePlus2 className="size-4" aria-hidden /> New analysis</LinkButton>}
    />
  );

  if (data.totalComparisons === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<FolderOpen className="size-7" aria-hidden />}
          title="No saved comparisons yet"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              {data.resumeCount === 0 ? (
                <LinkButton to="/app/resumes"><FileText className="size-4" aria-hidden /> Add your resume</LinkButton>
              ) : (
                <LinkButton to="/app/analyze"><FilePlus2 className="size-4" aria-hidden /> Compare with a job</LinkButton>
              )}
            </div>
          }
        >
          {data.resumeCount === 0
            ? "Start by uploading a PDF resume or pasting its text. Then compare it with a job description and save the result to see trends here."
            : `You have ${plural(data.resumeCount, "resume")} ready. Run an analysis against a job description and save it to build your dashboard.`}
        </EmptyState>
      </>
    );
  }

  const { trend } = data;
  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Saved comparisons" value={String(data.totalComparisons)} detail={plural(data.resumeCount, "resume") + " on file"} />
        <Stat label="Average score" value={formatScore(data.averageScore, 1)} detail="Across all saved comparisons" />
        <Stat
          label="Highest score"
          value={formatScore(data.highestScore)}
          detail={data.highestScoreComparisonId && <Link to={`/app/comparisons/${data.highestScoreComparisonId}`} className="underline underline-offset-2 hover:text-ink">{data.highestScoreComparisonName}</Link>}
        />
        <Stat label="Comparable history" value={String(trend.points.length)} detail={trend.scoringVersion ? `Scoring version ${trend.scoringVersion}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Score trend"
          description={
            <>
              Your most recent {plural(trend.points.length, "saved comparison")} scored with version {trend.scoringVersion}, oldest to newest.
              {trend.excludedOtherVersions > 0 && ` ${plural(trend.excludedOtherVersions, "comparison")} from other scoring versions ${trend.excludedOtherVersions === 1 ? "is" : "are"} excluded because the scores are not directly comparable.`}
            </>
          }
        >
          {trend.points.length >= 2 ? (
            <>
              <TrendChart points={trend.points} />
              <table className="sr-only">
                <caption>Score trend</caption>
                <thead><tr><th>Comparison</th><th>Date</th><th>Score</th></tr></thead>
                <tbody>{trend.points.map((p) => <tr key={p.id}><td>{p.name}</td><td>{formatDate(p.createdAt)}</td><td>{p.score}</td></tr>)}</tbody>
              </table>
            </>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-paper p-4 text-sm text-muted"><TrendingUp className="size-4" aria-hidden /> Save at least two comparisons to see a trend line.</p>
          )}
        </Panel>
        <Panel title="Score bands" description="How your saved comparisons are distributed.">
          <BandDistribution bands={data.scoreBands} total={data.totalComparisons} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Frequently missing required skills" description="Required skills that your resume did not evidence, counted across saved comparisons.">
          {data.frequentlyMissingSkills.length === 0 ? (
            <p className="text-sm text-muted">No required skills are missing across your saved comparisons.</p>
          ) : (
            <ol className="space-y-2.5">
              {data.frequentlyMissingSkills.map((s, i) => (
                <li key={s.skill} className="flex items-center gap-3">
                  <span className="w-5 font-display text-sm text-muted">{i + 1}</span>
                  <span className="flex-1 text-sm font-medium">{s.skill}</span>
                  <Badge className="bg-clay-50 text-clay-700 ring-clay-300">{plural(s.count, "job")}</Badge>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="Most requested skills" description="Skills appearing most often in your saved job descriptions, and how often your resume matched them.">
          {data.mostRequestedSkills.length === 0 ? (
            <p className="text-sm text-muted">No skills recorded yet.</p>
          ) : (
            <>
              <DemandChart skills={data.mostRequestedSkills} />
              <table className="sr-only">
                <caption>Most requested skills</caption>
                <thead><tr><th>Skill</th><th>Requested</th><th>Matched</th></tr></thead>
                <tbody>{data.mostRequestedSkills.map((s) => <tr key={s.skill}><td>{s.skill}</td><td>{s.requested}</td><td>{s.matched}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </Panel>
      </div>

      <section className="card mt-6 overflow-hidden" aria-label="Recent comparisons">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-semibold">Recent comparisons</h2>
          <Link to="/app/comparisons" className="inline-flex items-center gap-1 text-sm font-medium text-sage-700 hover:underline">View all <ArrowRight className="size-4" aria-hidden /></Link>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {data.recent.map((c) => (
            <li key={c.id}>
              <Link to={`/app/comparisons/${c.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-sage-50/60">
                <span className="w-12 font-display text-2xl font-semibold tabular-nums text-sage-700">{formatScore(c.overallScore)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted">{c.resumeTitle ?? "Deleted resume"} · {formatDate(c.createdAt)}</span>
                </span>
                <Badge className={BAND_META[c.scoreBand].badge}>{BAND_META[c.scoreBand].label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
