"""Job description intelligence: requirement extraction and classification."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.errors import InvalidInputError
from app.nlp.resume import RESUME_HEADINGS
from app.nlp.skills import LineRef, SkillMention, extract_from_lines
from app.nlp.taxonomy import CATEGORY_LABELS, Taxonomy
from app.nlp.text import detect_heading, is_bullet, normalize_text, split_sections, split_sentences, strip_bullet, word_count
from app.schemas import (
    ExperienceRequirement,
    Importance,
    JobRequirements,
    RequirementOverride,
    RequirementSkill,
    RequirementStatement,
)

JOB_HEADINGS: dict[str, tuple[str, ...]] = {
    "about": ("about us", "about the company", "who we are", "company overview", "about the team", "our mission",
              "about the role", "overview", "company description", "our team"),
    "responsibilities": ("responsibilities", "key responsibilities", "what you'll do", "what you will do", "your role",
                         "the role", "duties", "job duties", "day to day", "what you'll be doing", "your responsibilities",
                         "role and responsibilities", "roles and responsibilities", "job responsibilities", "in this role",
                         "what you will be doing", "the opportunity", "your impact"),
    "required": ("requirements", "required qualifications", "qualifications", "minimum qualifications",
                 "basic qualifications", "must have", "must-have", "must haves", "must-haves", "what you bring",
                 "what we're looking for", "what we are looking for", "who you are", "required skills",
                 "skills required", "eligibility", "eligibility criteria", "you have", "you should have", "key skills",
                 "technical skills", "skills", "requirements and qualifications", "job requirements", "skills and qualifications",
                 "what you need", "candidate profile"),
    "preferred": ("preferred qualifications", "preferred skills", "preferred", "nice to have", "nice-to-have",
                  "nice to haves", "good to have", "bonus points", "bonus", "pluses", "desired skills", "desirable",
                  "additional qualifications", "extra credit", "it would be great if", "bonus skills", "good-to-have",
                  "preferred requirements", "desired qualifications"),
    "benefits": ("benefits", "perks", "what we offer", "compensation", "why join us", "perks and benefits",
                 "benefits and perks", "salary", "stipend", "why work with us"),
    "other": ("how to apply", "equal opportunity", "equal opportunity employer", "location", "application process",
              "diversity and inclusion", "job details"),
}
IGNORED_SECTIONS = frozenset({"about", "benefits", "other"})
JOB_SECTION_LABELS = {"intro": "Introduction", "about": "About", "responsibilities": "Responsibilities",
                      "required": "Requirements", "preferred": "Preferred qualifications", "benefits": "Benefits",
                      "other": "Other"}

PREFERRED_CUE = re.compile(
    r"\b(?:preferred|nice[\s-]to[\s-]have|good[\s-]to[\s-]have|(?:is|are|a|an|big|huge)\s+plus|bonus|desirable|desired|"
    r"advantageous|an advantage|ideally|optional|not required|would be great|is a bonus)\b",
    re.IGNORECASE,
)
REQUIRED_CUE = re.compile(r"\b(?:must|required|requirement|mandatory|need to|needs to|essential|minimum|at least)\b", re.IGNORECASE)
YEARS_RE = re.compile(
    r"(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?", re.IGNORECASE
)
EXPERIENCE_CONTEXT = re.compile(r"\b(?:experience|experienced|industry|professional|working)\b", re.IGNORECASE)
EDUCATION_RE = re.compile(
    r"\b(?:bachelor'?s?|master'?s?|b\.?\s?tech|m\.?\s?tech|b\.?e\.|b\.?s\.?c?|m\.?s\.?c?|ph\.?d|degree|graduate|"
    r"undergraduate|diploma|mca|bca|computer science|cs/it|pursuing)\b",
    re.IGNORECASE,
)
CERTIFICATION_RE = re.compile(r"\b(?:certifi(?:ed|cation|cations|cate)|licen[sc]e)\b", re.IGNORECASE)
ACTION_VERBS = frozenset(
    "design develop build implement write maintain collaborate participate work create test debug deploy optimize "
    "optimise support contribute analyze analyse document integrate troubleshoot review assist own lead drive ensure "
    "monitor improve deliver partner research automate manage migrate help communicate architect refactor mentor "
    "translate gather prototype ship scale investigate perform conduct prepare coordinate".split()
)
_OR_SEP = re.compile(r"^\s*(?:,?\s*or|/|,|\band/or\b|,\s*and/or)\s*$", re.IGNORECASE)
_AND_SEP = re.compile(r"\band\b|&|\+", re.IGNORECASE)
JOB_SIGNAL = re.compile(
    r"\b(?:you will|you'll|we are looking|we're looking|responsibilit\w*|requirements?|qualifications?|candidates?|"
    r"years? of experience|experience (?:with|in)|knowledge of|proficien\w+|ability to|the role|this role|apply)\b",
    re.IGNORECASE,
)
_RESUME_HINT_HEADINGS = ("education", "experience", "projects", "certifications")


@dataclass
class JobUnit:
    """A requirement or responsibility statement used for semantic comparison."""

    text: str
    kind: str  # "requirement" | "responsibility"
    importance: Importance


@dataclass
class ParsedJob:
    text: str
    requirements: JobRequirements
    units: list[JobUnit] = field(default_factory=list)
    lines: list[LineRef] = field(default_factory=list)


def _clause_importance(clause: str, section: str) -> tuple[Importance, float]:
    if PREFERRED_CUE.search(clause):
        return "preferred", 0.9
    if section == "preferred":
        return "preferred", 0.9
    if REQUIRED_CUE.search(clause):
        return "required", 0.9
    if section in ("required", "responsibilities"):
        return "required", 0.85
    return "required", 0.7


def _split_clauses(line: str) -> list[str]:
    clauses: list[str] = []
    for sent in split_sentences(line):
        clauses.extend(c.strip() for c in re.split(r";\s+|\s+—\s+", sent) if c.strip())
    return clauses or [line]


def _starts_with_action_verb(text: str) -> bool:
    first = re.match(r"[A-Za-z]+", text)
    if not first:
        return False
    w = first.group(0).lower()
    return w in ACTION_VERBS or (w.endswith("s") and w[:-1] in ACTION_VERBS) or (w.endswith("ing") and w[:-3] in ACTION_VERBS)


def _group_alternatives(clause: str, mentions: list[SkillMention]) -> list[list[SkillMention]]:
    """Group mentions joined by "or" (e.g. "React, Angular, or Vue") into alternative sets.

    Slash-separated pairs ("MySQL/PostgreSQL") are alternatives only when they belong to
    the same technology family; "and"-joined lists are always separate requirements.
    """
    ordered = sorted(mentions, key=lambda m: m.start)
    groups: list[list[SkillMention]] = []
    current: list[SkillMention] = []
    has_or = False
    for m in ordered:
        if not current:
            current, has_or = [m], False
            continue
        prev = current[-1]
        between = clause[prev.end : m.start]
        if _OR_SEP.match(between) and not _AND_SEP.search(between):
            is_slash = between.strip() == "/"
            same_family = bool(set(prev.skill.families) & set(m.skill.families))
            same_cat = prev.skill.category == m.skill.category
            if ("or" in between.lower() and same_cat) or (is_slash and same_family) or (between.strip() == "," and same_cat):
                has_or = has_or or "or" in between.lower() or is_slash
                current.append(m)
                continue
        groups.extend(_finalise(current, has_or))
        current, has_or = [m], False
    if current:
        groups.extend(_finalise(current, has_or))
    return groups


def _finalise(run: list[SkillMention], has_or: bool) -> list[list[SkillMention]]:
    if has_or and len(run) > 1:
        return [run]
    return [[m] for m in run]


def parse_job_description(text: str, taxonomy: Taxonomy, *, max_chars: int, min_words: int) -> ParsedJob:
    norm = normalize_text(text)
    if not norm:
        raise InvalidInputError("The job description is empty.", code="EMPTY_JOB_DESCRIPTION")
    if len(norm) > max_chars:
        raise InvalidInputError(
            f"The job description is too long ({len(norm):,} characters). The limit is {max_chars:,} characters.",
            code="JOB_DESCRIPTION_TOO_LONG",
        )
    if word_count(norm) < min_words:
        raise InvalidInputError(
            f"The job description is too short to analyse. Paste the complete posting (at least {min_words} words), "
            "including responsibilities and requirements.",
            code="JOB_DESCRIPTION_TOO_SHORT",
        )

    sections = split_sections(norm, JOB_HEADINGS, default_key="intro")
    warnings: list[str] = []
    lines: list[LineRef] = []
    idx = 0
    for sec in sections:
        for ln in sec.lines:
            lines.append(LineRef(section=sec.key, text=ln, index=idx))
            idx += 1

    # Resume-like content check: resume headings present but no job headings.
    resume_heading_hits = sum(
        1 for ln in norm.split("\n") if detect_heading(ln, {k: RESUME_HEADINGS[k] for k in _RESUME_HINT_HEADINGS})
    )
    job_keys = {s.key for s in sections} - {"intro"}
    if resume_heading_hits >= 2 and not (job_keys & {"responsibilities", "preferred"}) and not JOB_SIGNAL.search(norm):
        warnings.append("This text looks more like a resume than a job description. Check that you pasted the job posting.")

    first_line = norm.split("\n", 1)[0].strip()
    suggested_title = (
        first_line if 1 <= word_count(first_line) <= 8 and not first_line.endswith(".")
        and not detect_heading(first_line, JOB_HEADINGS) else None
    )
    title_line = lines[0] if suggested_title and lines and lines[0].text.strip() == first_line else None
    skill_lines = [ln for ln in lines if ln.section not in IGNORED_SECTIONS and ln is not title_line]
    requirements: dict[str, RequirementSkill] = {}
    competencies: dict[str, RequirementSkill] = {}
    statements: list[RequirementStatement] = []
    responsibilities: list[str] = []
    experience: list[ExperienceRequirement] = []
    education: list[str] = []
    certifications: list[str] = []
    units: list[JobUnit] = []

    for line in skill_lines:
        content = strip_bullet(line.text)
        if not content:
            continue
        line_importance, _ = _clause_importance(content, line.section)
        words = word_count(content)
        is_resp = line.section == "responsibilities" or (
            line.section == "intro" and _starts_with_action_verb(content) and words >= 4
        )
        if is_resp and words >= 3:
            responsibilities.append(content)
            units.append(JobUnit(content, "responsibility", line_importance))
        elif words >= 3 and (line.section in ("required", "preferred") or is_bullet(line.text) or line.section == "intro"):
            if line.section == "intro" and not is_bullet(line.text) and words > 60:
                # Long intro paragraphs are split into sentences for finer-grained comparison.
                for sent in split_sentences(content):
                    if word_count(sent) >= 4:
                        imp, _ = _clause_importance(sent, line.section)
                        statements.append(RequirementStatement(text=sent, importance=imp))
                        units.append(JobUnit(sent, "requirement", imp))
            else:
                statements.append(RequirementStatement(text=content, importance=line_importance))
                units.append(JobUnit(content, "requirement", line_importance))

        for ym in YEARS_RE.finditer(content):
            if EXPERIENCE_CONTEXT.search(content):
                lo = float(ym.group(1))
                hi = float(ym.group(2)) if ym.group(2) else None
                if lo <= 30:
                    experience.append(ExperienceRequirement(min_years=lo, max_years=hi, text=content))
                break
        if EDUCATION_RE.search(content) and words <= 60:
            education.append(content)
        if CERTIFICATION_RE.search(content):
            certifications.append(content)

        for clause in _split_clauses(content):
            importance, confidence = _clause_importance(clause, line.section)
            clause_line = LineRef(section=line.section, text=clause, index=line.index)
            hits = extract_from_lines([clause_line], taxonomy)
            accepted = [m for h in hits.values() for m in h.accepted]
            tech = [m for m in accepted if m.skill.is_technical]
            for m in accepted:
                if not m.skill.is_technical:
                    _merge(competencies, m.skill.name, m.skill.category, importance, clause, confidence, [])
            for group in _group_alternatives(clause, tech):
                primary = group[0].skill
                alts = [g.skill.name for g in group[1:] if g.skill.name != primary.name]
                _merge(requirements, primary.name, primary.category, importance, clause, confidence, alts)

    if title_line is not None:
        # Skills in the job title (e.g. "Java Developer") count only if not stated elsewhere.
        for h in extract_from_lines([title_line], taxonomy).values():
            for m in h.accepted:
                if m.skill.is_technical and m.skill.name not in requirements:
                    _merge(requirements, m.skill.name, m.skill.category, "required", f"Job title: {title_line.text}", 0.6, [])
    _drop_redundant_alternatives(requirements)
    if not requirements and not responsibilities and not any(JOB_SIGNAL.search(st.text) for st in statements):
        raise InvalidInputError(
            "This text does not look like a job description: no skills, requirements or responsibilities were found.",
            code="NOT_A_JOB_DESCRIPTION",
        )
    if not requirements:
        warnings.append("No recognised technical skills were found. You can add requirements manually.")

    detected = []
    for s in sections:
        label = JOB_SECTION_LABELS.get(s.key, s.key)
        if label not in detected:
            detected.append(label)

    reqs = JobRequirements(
        suggested_title=suggested_title[:120] if suggested_title else None,
        skills=sorted(requirements.values(), key=lambda r: (r.importance != "required", _cat_order(r.category), r.skill.lower())),
        competencies=sorted(competencies.values(), key=lambda r: r.skill.lower()),
        responsibilities=_dedupe(responsibilities),
        requirement_statements=_dedupe_statements(statements),
        experience=experience,
        education=_dedupe(education),
        certifications=_dedupe(certifications),
        sections_detected=detected,
        warnings=warnings,
    )
    return ParsedJob(text=norm, requirements=reqs, units=_dedupe_units(units), lines=lines)


_CAT_ORDER = ["language", "framework", "library", "database", "cloud", "devops", "testing", "tool", "concept", "ai_ml",
              "methodology", "custom"]


def _cat_order(cat: str) -> int:
    return _CAT_ORDER.index(cat) if cat in _CAT_ORDER else len(_CAT_ORDER)


def _merge(store: dict[str, RequirementSkill], name: str, category: str, importance: Importance, evidence: str,
           confidence: float, alternatives: list[str]) -> None:
    """Add a requirement; the same skill is kept once and 'required' wins over 'preferred'."""
    existing = store.get(name)
    if existing is None:
        store[name] = RequirementSkill(
            skill=name, category=category, category_label=CATEGORY_LABELS.get(category, category), importance=importance,
            alternatives=alternatives, evidence=evidence, confidence=confidence,
        )
        return
    if existing.importance == "preferred" and importance == "required":
        store[name] = existing.model_copy(update={"importance": "required", "evidence": evidence, "confidence": confidence,
                                                  "alternatives": alternatives})
    elif existing.alternatives and not alternatives and importance == existing.importance:
        # A standalone mention is stricter than an "A or B" mention.
        store[name] = existing.model_copy(update={"alternatives": []})


def _drop_redundant_alternatives(store: dict[str, RequirementSkill]) -> None:
    """Remove alternatives that are themselves standalone requirements to avoid double counting."""
    for name, req in list(store.items()):
        if req.alternatives:
            alts = [a for a in req.alternatives if a not in store]
            store[name] = req.model_copy(update={"alternatives": alts})
    for name, req in list(store.items()):
        if name in store:
            for alt in req.alternatives:
                store.pop(alt, None)


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for i in items:
        k = i.lower()
        if k not in seen:
            seen.add(k)
            out.append(i)
    return out


def _dedupe_statements(items: list[RequirementStatement]) -> list[RequirementStatement]:
    seen: set[str] = set()
    out = []
    for i in items:
        if i.text.lower() not in seen:
            seen.add(i.text.lower())
            out.append(i)
    return out


def _dedupe_units(units: list[JobUnit]) -> list[JobUnit]:
    seen: set[str] = set()
    out = []
    for u in units:
        if u.text.lower() not in seen:
            seen.add(u.text.lower())
            out.append(u)
    return out


def apply_overrides(parsed: ParsedJob, overrides: list[RequirementOverride], taxonomy: Taxonomy) -> list[RequirementSkill]:
    """Replace extracted skill requirements with the user's corrected list.

    Known skills/aliases resolve to canonical taxonomy entries. Unknown skills are kept as
    ``custom`` requirements and matched literally against the resume.
    """
    result: dict[str, RequirementSkill] = {}
    extracted = {r.skill: r for r in parsed.requirements.skills}
    for ov in overrides:
        sd = taxonomy.lookup(ov.skill)
        name = sd.name if sd else ov.skill.strip()
        category = sd.category if sd else "custom"
        alts: list[str] = []
        for a in ov.alternatives:
            asd = taxonomy.lookup(a)
            alt_name = asd.name if asd else a
            if alt_name != name and alt_name not in alts:
                alts.append(alt_name)
        evidence = extracted[name].evidence if name in extracted else _find_line(parsed, name, sd)
        req = RequirementSkill(
            skill=name, category=category, category_label=CATEGORY_LABELS.get(category, "Custom requirement"),
            importance=ov.importance, alternatives=alts, evidence=evidence, confidence=1.0, custom=sd is None,
        )
        if name in result and result[name].importance == "required":
            continue
        result[name] = req
    _drop_redundant_alternatives(result)
    return list(result.values())


def _find_line(parsed: ParsedJob, name: str, sd) -> str:  # type: ignore[no-untyped-def]
    needles = [name.lower()] + ([a.lower() for a in sd.aliases] if sd else [])
    for ln in parsed.lines:
        low = ln.text.lower()
        if any(n in low for n in needles):
            return strip_bullet(ln.text)
    return "Added manually during requirement review"
