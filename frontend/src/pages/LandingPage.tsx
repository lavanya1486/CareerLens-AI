import { ArrowRight, FileSearch, ListChecks, Scale, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Alert, LinkButton } from "../components/ui";

// Weights are the published defaults of scoring config v1.0.0 (ai-service/app/data/scoring_config.json).
const COMPONENTS = [
  { name: "Required skill coverage", weight: 35, note: "Explicit evidence for each required skill, with alternatives counted once." },
  { name: "Semantic alignment", weight: 20, note: "Sentence embeddings compare each job statement with your closest resume line." },
  { name: "Project relevance", weight: 15, note: "How well your strongest projects demonstrate the requested skills." },
  { name: "Preferred skill coverage", weight: 10, note: "Nice-to-have skills, never allowed to outweigh required ones." },
  { name: "Experience alignment", weight: 10, note: "Responsibilities you have performed, plus stated years against dates found." },
  { name: "Evidence strength", weight: 10, note: "Skills shown in projects or work count more than skills only listed." },
];

const STEPS = [
  { icon: FileSearch, title: "Read", body: "Upload a text-based PDF or paste your resume. You can review and correct the extracted text before anything is analysed." },
  { icon: ListChecks, title: "Extract", body: "Paste a job description. Required and preferred skills are separated, and you can edit the list before scoring." },
  { icon: Scale, title: "Explain", body: "Every match, partial match and gap is shown with the resume line and job line that support it." },
];

export function LandingPage() {
  const { status, signOutReason } = useAuth();
  const accountDeleted = status === "anonymous" && signOutReason === "deleted";
  const primary = status === "authenticated"
    ? { to: "/app/analyze", label: "Start a new analysis" }
    : { to: "/register", label: "Create a free account" };

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      {accountDeleted && (
        <Alert tone="success" className="mt-6" title="Your account has been deleted">
          Your resumes, comparisons and reports were permanently removed.
        </Alert>
      )}
      <section className="grid gap-12 pb-20 pt-10 md:grid-cols-[1.2fr_1fr] md:items-end md:pt-16">
        <div>
          <p className="eyebrow">Resume &amp; job description matcher</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] md:text-6xl lg:text-7xl">
            See your resume the way a <em className="font-normal text-sage-600">careful reader</em> would.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            CareerLens compares your resume with a specific job description and explains every finding — what is clearly shown, what is only related, and what the role asks for that your resume does not yet mention.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton to={primary.to} size="lg">
              {primary.label} <ArrowRight className="size-4" aria-hidden />
            </LinkButton>
            {status !== "authenticated" && <LinkButton to="/login" variant="secondary" size="lg">Sign in</LinkButton>}
          </div>
        </div>
        <aside className="card relative overflow-hidden p-7">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-mustard-100" aria-hidden />
          <p className="eyebrow relative">Our principles</p>
          <ul className="relative mt-4 space-y-4 text-[0.95rem] leading-relaxed">
            <li><span className="font-display text-lg font-semibold">Evidence first.</span> A skill only counts when a line in your resume shows it.</li>
            <li><span className="font-display text-lg font-semibold">No black box.</span> Weights, versions and each component's arithmetic are on the results page.</li>
            <li><span className="font-display text-lg font-semibold">Not a verdict.</span> The score describes alignment between two documents — never your chances of being hired.</li>
          </ul>
        </aside>
      </section>

      <section className="rule py-16" aria-labelledby="how">
        <div className="grid gap-10 md:grid-cols-[14rem_1fr]">
          <div>
            <p className="font-display text-sm text-mustard-700">01</p>
            <h2 id="how" className="mt-1 text-3xl font-semibold">How it works</h2>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="card p-6">
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-sage-600" aria-hidden />
                  <span className="font-display text-sm text-muted">Step {i + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rule py-16" aria-labelledby="score">
        <div className="grid gap-10 md:grid-cols-[14rem_1fr]">
          <div>
            <p className="font-display text-sm text-mustard-700">02</p>
            <h2 id="score" className="mt-1 text-3xl font-semibold">What a score is made of</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">Default weights of scoring version 1.0.0. If a component cannot be measured, the others are re-weighted and the page says so.</p>
          </div>
          <div className="card divide-y divide-line">
            {COMPONENTS.map((c) => (
              <div key={c.name} className="grid grid-cols-[4rem_1fr] gap-4 p-5 sm:grid-cols-[5rem_1fr_12rem] sm:items-center">
                <p className="font-display text-3xl font-semibold text-sage-700">{c.weight}<span className="text-base text-muted">%</span></p>
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="mt-0.5 text-sm text-muted">{c.note}</p>
                </div>
                <div className="col-span-2 h-2 overflow-hidden rounded-full bg-paper sm:col-span-1" aria-hidden>
                  <div className="h-full rounded-full bg-sage-500" style={{ width: `${(c.weight / 35) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rule py-16" aria-labelledby="honest">
        <div className="grid gap-10 md:grid-cols-[14rem_1fr]">
          <div>
            <p className="font-display text-sm text-mustard-700">03</p>
            <h2 id="honest" className="mt-1 text-3xl font-semibold">What it will not do</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Guess from similarity alone", "Semantically similar wording is shown as a hint to review, but it never earns skill credit on its own."],
              ["Read scanned images", "There is no OCR. Image-only PDFs are detected and you are asked to paste the text instead."],
              ["Keep your files", "Uploaded PDFs are processed in memory and discarded. Only the extracted text you approve is stored."],
              ["Invent experience", "Suggestions refer only to skills and projects found in your resume or the job description."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-line bg-surface/60 p-5">
                <p className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-sage-600" aria-hidden /> {title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-20 rounded-[2rem] bg-sage-800 px-8 py-14 text-center text-paper md:px-16">
        <h2 className="text-3xl font-semibold text-paper md:text-4xl">Bring one resume and one job description.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sage-100">A complete, explained comparison usually takes a few seconds once your text is ready.</p>
        <LinkButton to={primary.to} variant="accent" size="lg" className="mt-8">
          {primary.label} <ArrowRight className="size-4" aria-hidden />
        </LinkButton>
      </section>
    </div>
  );
}
