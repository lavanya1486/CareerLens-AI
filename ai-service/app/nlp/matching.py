"""Requirement-to-resume skill matching with explicit evidence and reasoning."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.nlp.resume import SECTION_LABELS
from app.nlp.scoring import ScoringConfig
from app.nlp.skills import LineRef, SkillHits, SkillMention
from app.nlp.taxonomy import CATEGORY_LABELS, Taxonomy
from app.nlp.text import strip_bullet, truncate
from app.schemas import Evidence, RequirementSkill, ResumeSkill, SkillMatch

SECTION_PRIORITY = {"experience": 3, "projects": 3, "summary": 2, "certifications": 2, "achievements": 2,
                    "education": 2, "other": 1, "skills": 1, "header": 1}
DEMONSTRATED_SECTIONS = frozenset({"experience", "projects"})
LISTED_SECTIONS = frozenset({"skills"})


def evidence_from_line(line: LineRef) -> Evidence:
    return Evidence(text=truncate(strip_bullet(line.text), 260), section=line.section,
                    section_label=SECTION_LABELS.get(line.section, line.section.title()))


def strength_for_sections(sections: set[str]) -> str:
    if sections & DEMONSTRATED_SECTIONS:
        return "demonstrated"
    if sections - LISTED_SECTIONS:
        return "mentioned"
    if sections:
        return "listed"
    return "none"


def _is_list_line(text: str) -> bool:
    """Comma/pipe-separated technology lists are weaker evidence than descriptive sentences."""
    return "|" in text or text.count(",") >= 2 and len(text.split()) <= 14


def _best_mentions(mentions: list[SkillMention], limit: int = 3) -> list[SkillMention]:
    seen: set[int] = set()
    ordered = sorted(mentions, key=lambda m: (-SECTION_PRIORITY.get(m.line.section, 0), _is_list_line(m.line.text), m.line.index))
    out = []
    for m in ordered:
        if m.line.index in seen:
            continue
        seen.add(m.line.index)
        out.append(m)
        if len(out) >= limit:
            break
    return out


@dataclass
class CustomHit:
    name: str
    lines: list[LineRef]


def find_custom_skill(name: str, lines: list[LineRef]) -> CustomHit:
    """Literal, case-insensitive phrase search for user-added skills outside the taxonomy."""
    words = [w for w in re.split(r"[\s\-]+", name.strip()) if w]
    pattern = re.compile(r"(?<![A-Za-z0-9])" + r"[\s\-]?".join(re.escape(w) for w in words) + r"(?![A-Za-z0-9])", re.IGNORECASE)
    return CustomHit(name, [ln for ln in lines if pattern.search(ln.text)])


def resume_skill_list(hits: dict[str, SkillHits]) -> list[ResumeSkill]:
    out = []
    for name, h in hits.items():
        confirmed = h.is_confirmed
        secs = sorted(h.sections if confirmed else {m.line.section for m in h.mentions})
        out.append(ResumeSkill(skill=name, category=h.skill.category,
                               category_label=CATEGORY_LABELS.get(h.skill.category, h.skill.category),
                               sections=secs, confirmed=confirmed))
    return sorted(out, key=lambda s: (not s.confirmed, s.category, s.skill.lower()))


def match_requirement(req: RequirementSkill, hits: dict[str, SkillHits], lines: list[LineRef], taxonomy: Taxonomy,
                      config: ScoringConfig) -> SkillMatch:
    members = [req.skill, *req.alternatives]
    label = req.skill + (f" (or {', '.join(req.alternatives)})" if req.alternatives else "")
    importance_word = "required" if req.importance == "required" else "preferred"

    # 1) Explicit evidence for the skill or an accepted alternative.
    for member in members:
        sd = taxonomy.get(member)
        if sd is None:
            custom = find_custom_skill(member, lines)
            if custom.lines:
                ev = [evidence_from_line(ln) for ln in sorted(custom.lines, key=lambda ln: -SECTION_PRIORITY.get(ln.section, 0))[:3]]
                strength = strength_for_sections({ln.section for ln in custom.lines})
                return _matched(req, member, ev, strength, 0.8, label, importance_word)
            continue
        h = hits.get(member)
        if h and h.is_confirmed:
            best = _best_mentions(h.accepted)
            ev = [evidence_from_line(m.line) for m in best]
            strength = strength_for_sections(h.sections)
            unambiguous = any(not m.ambiguous for m in h.accepted)
            confidence = (0.95 if strength == "demonstrated" else 0.85) if unambiguous else 0.7
            return _matched(req, member, ev, strength, confidence, label, importance_word)

    # 2) Ambiguous mentions (e.g. "Go" used without supporting context) need review.
    for member in members:
        h = hits.get(member)
        if h and h.mentions and not h.is_confirmed:
            ev = [evidence_from_line(m.line) for m in _best_mentions(h.mentions)]
            return SkillMatch(
                skill=req.skill, category=req.category, category_label=req.category_label, importance=req.importance,
                alternatives=req.alternatives, status="review", matched_via=member, credit=0.0, confidence=0.3,
                job_evidence=req.evidence, resume_evidence=ev, evidence_strength="none", related_resume_skills=[],
                reasoning=(f"The resume contains the word '{h.mentions[0].matched_text}', but the surrounding text does not "
                           f"confirm it refers to {member}. It is not credited automatically."),
                next_step=f"If you mean {member}, make it explicit (for example '{member} ({sd_alias_hint(member, taxonomy)})') "
                          "or list it in your Skills section.",
            )

    # 3) Related-but-distinct technologies -> partial credit only.
    related: list[tuple[str, str]] = []
    for member in members:
        sd = taxonomy.get(member)
        if sd is None:
            continue
        for name, h in hits.items():
            if not h.is_confirmed or name in members:
                continue
            other = h.skill
            if member in other.implies:
                related.append((name, f"{name} usually involves {member}, but {member} itself is not stated"))
                continue
            shared = set(other.families) & set(sd.families)
            if shared:
                fam = taxonomy.family_label(sorted(shared)[0])
                related.append((name, f"{name} and {member} are both {fam}, but they are distinct technologies"))
    if related:
        related = sorted(dict(related).items(), key=lambda kv: kv[0].lower())
        names = [r[0] for r in related]
        ev_lines: list[Evidence] = []
        for n in names[:3]:
            best = _best_mentions(hits[n].accepted, 1)
            if best:
                ev_lines.append(evidence_from_line(best[0].line))
        reason = "; ".join(r[1] for r in related[:3])
        return SkillMatch(
            skill=req.skill, category=req.category, category_label=req.category_label, importance=req.importance,
            alternatives=req.alternatives, status="partial", matched_via=None, credit=config.partial_credit, confidence=0.6,
            job_evidence=req.evidence, resume_evidence=ev_lines, evidence_strength="none", related_resume_skills=names,
            reasoning=f"Partial match: {reason}. Transferable experience earns {int(config.partial_credit * 100)}% credit, "
                      "not a full match.",
            next_step=(f"If you have used {req.skill}, name it explicitly with an example. Otherwise, present your "
                       f"{', '.join(names[:2])} experience as transferable and consider learning {req.skill}."),
        )

    # 4) Missing evidence.
    if req.importance == "required":
        next_step = (f"If you have {req.skill} experience, add it with a concrete example. If not, {req.skill} is a "
                     "required skill for this role and worth learning.")
    else:
        next_step = f"Optional: {req.skill} is a nice-to-have. Learning it could strengthen your application."
    return SkillMatch(
        skill=req.skill, category=req.category, category_label=req.category_label, importance=req.importance,
        alternatives=req.alternatives, status="missing", matched_via=None, credit=0.0, confidence=0.85,
        job_evidence=req.evidence, resume_evidence=[], evidence_strength="none", related_resume_skills=[],
        reasoning=(f"No mention of {label} was found in the resume. A missing keyword does not prove the candidate lacks "
                   "the skill - it only means the document does not show it."),
        next_step=next_step,
    )


def sd_alias_hint(member: str, taxonomy: Taxonomy) -> str:
    sd = taxonomy.get(member)
    if sd and sd.aliases:
        return sd.aliases[0]
    return "the full technology name"


def _matched(req: RequirementSkill, member: str, ev: list[Evidence], strength: str, confidence: float, label: str,
             importance_word: str) -> SkillMatch:
    via_alt = member != req.skill
    if strength == "demonstrated":
        reasoning = f"{member} is used in your {', '.join(sorted({e.section_label for e in ev}))} content, which demonstrates it in context."
        next_step = "Keep this evidence prominent and quantify the outcome where you truthfully can."
    elif strength == "mentioned":
        reasoning = f"{member} is mentioned outside the skills list, but not inside a project or role description."
        next_step = f"Add a project or experience bullet showing how you applied {member}."
    else:
        reasoning = f"{member} appears only in your skills list, without supporting project or work evidence."
        next_step = f"Add a project or experience bullet showing how you applied {member}, if that is accurate."
    if via_alt:
        reasoning = f"The posting accepts {label}; your resume shows {member}. " + reasoning
    return SkillMatch(
        skill=req.skill, category=req.category, category_label=req.category_label, importance=req.importance,
        alternatives=req.alternatives, status="matched", matched_via=member, credit=1.0, confidence=confidence,
        job_evidence=req.evidence, resume_evidence=ev, evidence_strength=strength, related_resume_skills=[],
        reasoning=f"Matches the {importance_word} skill. " + reasoning, next_step=next_step,
    )
