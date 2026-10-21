import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SkillMatch } from "../../api/types";
import { comparisonFixture } from "../../test/utils";
import { ScoreRing } from "../ScoreRing";
import { ComponentBreakdown } from "./ComponentBreakdown";
import { ProjectList } from "./ProjectList";
import { Recommendations } from "./Recommendations";
import { SkillFindings } from "./SkillFindings";

const result = comparisonFixture.result;

describe("ScoreRing", () => {
  it("announces the rounded score and band to assistive technology", () => {
    render(<ScoreRing score={63.1} band="good" />);
    expect(screen.getByRole("img", { name: "Alignment score: 63 out of 100, Good alignment" })).toBeInTheDocument();
  });
});

describe("ComponentBreakdown", () => {
  it("shows score × weight = points for every component of the real analysis", () => {
    render(<ComponentBreakdown components={result.components} />);
    expect(result.components).toHaveLength(6);
    for (const c of result.components) {
      expect(screen.getByText(c.label)).toBeInTheDocument();
      expect(screen.getByText(`× ${(c.effectiveWeight * 100).toFixed(0)}% = ${c.contribution.toFixed(1)} pts`)).toBeInTheDocument();
    }
  });

  it("contributions add up to the overall score", () => {
    const total = result.components.reduce((sum, c) => sum + c.contribution, 0);
    expect(total).toBeCloseTo(result.overallScore, 0);
  });
});

describe("SkillFindings", () => {
  const cardsShown = () => screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);

  it("lists every requirement and filters by status", async () => {
    const user = userEvent.setup();
    render(<SkillFindings matches={result.skillMatches} />);
    expect(cardsShown()).toHaveLength(result.skillMatches.length);

    const missing = result.skillMatches.filter((m) => m.status === "missing");
    await user.click(screen.getByRole("button", { name: new RegExp(`^Missing ${missing.length}$`) }));
    expect(cardsShown().sort()).toEqual(missing.map((m) => m.skill).sort());
    expect(screen.getByRole("button", { name: /^Missing/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("quotes resume evidence for matched skills", () => {
    const matched = result.skillMatches.find((m) => m.status === "matched" && m.resumeEvidence.length > 0)!;
    render(<SkillFindings matches={[matched]} />);
    expect(screen.getByText(matched.resumeEvidence[0]!.text)).toBeInTheDocument();
  });

  it("labels a semantic hint as not credited", () => {
    const base = result.skillMatches.find((m) => m.status === "missing")!;
    const withHint: SkillMatch = { ...base, semanticHint: { text: "Automated the build with GitHub Actions", section: "projects", sectionLabel: "Projects" }, semanticSimilarity: 0.61 };
    render(<SkillFindings matches={[withHint]} />);
    expect(screen.getByText(/similarity 0\.61\) — shown for review, not credited/)).toBeInTheDocument();
    expect(screen.getByText("Automated the build with GitHub Actions")).toBeInTheDocument();
  });
});

describe("ProjectList", () => {
  it("ranks projects and separates future ideas from completed work", () => {
    render(<ProjectList projects={result.projects} />);
    const top = result.projects[0]!;
    expect(screen.getByText(top.name)).toBeInTheDocument();
    const ideas = screen.getAllByText("Ideas for future work — not yet done");
    expect(ideas).toHaveLength(result.projects.filter((p) => p.futureImprovements.length > 0).length);
    const list = ideas[0]!.parentElement!;
    expect(within(list).getByText(top.futureImprovements[0]!)).toBeInTheDocument();
  });
});

describe("Recommendations", () => {
  it("renders every recommendation with its grounding", () => {
    render(<Recommendations items={result.recommendations} />);
    for (const r of result.recommendations) expect(screen.getByText(r.title)).toBeInTheDocument();
  });
});
