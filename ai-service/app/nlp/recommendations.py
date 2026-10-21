"""Evidence-grounded improvement recommendations.

Every recommendation references text from the job description and/or the resume. The
generator never claims the candidate has done something that is not in the resume;
suggestions to add content are always conditional on it being truthful.
"""

from __future__ import annotations

from app.nlp.resume import SECTION_LABELS, ResumeDocument
from app.nlp.text import truncate
from app.schemas import Alignment, ExperienceAnalysis, ProjectAnalysis, Recommendation, RequirementSkill, SkillMatch

MAX_RECOMMENDATIONS = 12


def build_recommendations(matches: list[SkillMatch], projects: list[ProjectAnalysis], alignments: list[Alignment],
                          experience: ExperienceAnalysis, resume: ResumeDocument,
                          requirements: list[RequirementSkill], responsibilities: list[str]) -> list[Recommendation]:
    recs: list[Recommendation] = []
    missing_req = [m for m in matches if m.status == "missing" and m.importance == "required"]
    missing_pref = [m for m in matches if m.status == "missing" and m.importance == "preferred"]
    partial = [m for m in matches if m.status == "partial"]
    listed_only = [m for m in matches if m.status == "matched" and m.evidence_strength == "listed"]
    review = [m for m in matches if m.status == "review"]

    for m in missing_req[:3]:
        hint = ""
        if m.semantic_hint:
            hint = (f" Your line \"{truncate(m.semantic_hint.text, 90)}\" is semantically related, but it does not name "
                    f"{m.skill}, so it was not credited.")
        recs.append(Recommendation(
            category="learn", priority="high", title=f"Close the gap on {m.skill}",
            detail=(f"The posting lists {m.skill} as required, and it was not found in your resume. If you have used it, "
                    f"add a specific example. If not, it is a strong candidate to learn next.{hint}"),
            grounding=[f"Job: {truncate(m.job_evidence, 160)}"],
        ))
    if len(missing_req) > 3:
        rest = [m.skill for m in missing_req[3:]]
        recs.append(Recommendation(
            category="learn", priority="medium", title="Other required skills without evidence",
            detail=f"These required skills were also not found: {', '.join(rest)}. Prioritise those most central to the role.",
            grounding=[f"Job: {truncate(m.job_evidence, 120)}" for m in missing_req[3:6]],
        ))
    if listed_only:
        names = [m.skill for m in listed_only[:6]]
        recs.append(Recommendation(
            category="evidence", priority="high" if any(m.importance == "required" for m in listed_only) else "medium",
            title="Show listed skills in action",
            detail=(f"{', '.join(names)} appear only in your skills list. Recruiters and screening tools trust skills that "
                    "are tied to a project or role. Add a bullet describing how you used each one, if that is accurate."),
            grounding=[f"Resume: {truncate(m.resume_evidence[0].text, 140)}" for m in listed_only[:2] if m.resume_evidence],
        ))
    for m in partial[:2]:
        related = ", ".join(m.related_resume_skills[:2])
        recs.append(Recommendation(
            category="highlight", priority="medium", title=f"Bridge {related} to {m.skill}",
            detail=(f"The posting asks for {m.skill}; your resume shows {related}, which is related but not equivalent. "
                    f"Present it as transferable experience, and name {m.skill} only if you have actually used it."),
            grounding=[f"Job: {truncate(m.job_evidence, 140)}"]
            + [f"Resume: {truncate(e.text, 140)}" for e in m.resume_evidence[:1]],
        ))
    if projects:
        top = projects[0]
        if top.matched_requirements:
            skills = ", ".join(r.skill for r in top.matched_requirements[:5])
            recs.append(Recommendation(
                category="project", priority="high", title=f"Lead with \"{top.name}\"",
                detail=(f"This is your most relevant project for this role: it demonstrates {skills}. Place it first in your "
                        "projects section and make the outcome measurable where you can do so truthfully."),
                grounding=[f"Resume: {truncate(e, 140)}" for e in top.evidence[:2]],
            ))
        weak = [p for p in projects if len(p.matched_requirements) == 0 and p.semantic_score < 20]
        if weak and len(projects) > 2:
            recs.append(Recommendation(
                category="project", priority="low", title="Trim less relevant projects for this application",
                detail=(f"{', '.join(p.name for p in weak[:3])} show little overlap with this posting. Consider shortening "
                        "them to make room for more relevant detail."),
                grounding=[f"Resume project: {p.header}" for p in weak[:2]],
            ))
    else:
        core = [r.skill for r in requirements if r.importance == "required"][:4]
        resp = truncate(responsibilities[0], 120) if responsibilities else None
        detail = "No projects section was detected. A focused project is the clearest way to show practical skill."
        if core:
            detail += f" A project that uses {', '.join(core)}"
            detail += f" and reflects the responsibility \"{resp}\"" if resp else ""
            detail += " would directly address this posting."
        recs.append(Recommendation(category="project", priority="high", title="Add a projects section", detail=detail,
                                   grounding=[f"Job: {truncate(r.evidence, 120)}" for r in requirements[:2]]))

    weak_align = [a for a in alignments if a.kind == "responsibility" and a.classification == "weak"][:2]
    for a in weak_align:
        closest = f" Your closest line is \"{truncate(a.best_evidence.text, 90)}\"." if a.best_evidence else ""
        recs.append(Recommendation(
            category="evidence", priority="medium", title="Describe experience related to a key responsibility",
            detail=(f"The role involves \"{truncate(a.requirement, 120)}\", and no strongly related statement was found in your "
                    f"resume.{closest} If you have done similar work, describe it directly."),
            grounding=[f"Job: {truncate(a.requirement, 140)}"],
        ))
    for m in review[:2]:
        recs.append(Recommendation(
            category="clarity", priority="medium", title=f"Clarify your mention of {m.matched_via or m.skill}",
            detail=m.next_step, grounding=[f"Resume: {truncate(e.text, 140)}" for e in m.resume_evidence[:1]],
        ))
    missing_sections = resume.missing_core_sections()
    if missing_sections:
        labels = ", ".join(SECTION_LABELS[s] for s in missing_sections)
        recs.append(Recommendation(
            category="clarity", priority="medium" if "skills" in missing_sections else "low",
            title="Use clear section headings",
            detail=(f"No {labels} section heading was detected. Clear headings help readers and screening tools find the "
                    "right evidence. If the content exists under another heading, rename it."),
            grounding=[f"Detected sections: {', '.join(SECTION_LABELS.get(k, k) for k in resume.section_keys())}"],
        ))
    if experience.status == "not_met" and experience.required_min_years is not None:
        recs.append(Recommendation(
            category="evidence", priority="medium", title="Address the experience requirement",
            detail=(f"The posting asks for about {experience.required_min_years:g}+ years of experience; the dates in your "
                    f"experience section add up to roughly {experience.estimated_months or 0} months. Make internships, "
                    "freelance or substantial project work visible with dates, if applicable."),
            grounding=[f"Job: {truncate(experience.explanation, 140)}"],
        ))
    elif experience.status == "unknown" and resume.experience:
        recs.append(Recommendation(
            category="clarity", priority="low", title="Add dates to experience entries",
            detail="No date ranges were found in your experience section, so experience duration could not be assessed.",
            grounding=[f"Resume: {truncate(resume.experience[0].header, 140)}"],
        ))
    if missing_pref:
        recs.append(Recommendation(
            category="learn", priority="low", title="Optional skills that would strengthen the application",
            detail=f"The posting marks these as preferred: {', '.join(m.skill for m in missing_pref[:6])}.",
            grounding=[f"Job: {truncate(m.job_evidence, 120)}" for m in missing_pref[:2]],
        ))
    order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: order[r.priority])
    return recs[:MAX_RECOMMENDATIONS]
