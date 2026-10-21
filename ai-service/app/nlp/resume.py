"""Resume structure analysis: sections, project/experience entries and date ranges."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from app.nlp.skills import LineRef
from app.nlp.text import Section, is_bullet, normalize_text, split_sections, strip_bullet, word_count

RESUME_HEADINGS: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "professional summary", "profile", "professional profile", "objective", "career objective",
                "about me", "about", "career summary"),
    "education": ("education", "academic background", "academics", "academic qualifications", "educational qualifications",
                  "education and training"),
    "skills": ("skills", "technical skills", "core skills", "key skills", "core competencies", "technologies",
               "tech stack", "tools and technologies", "technical proficiencies", "skills and tools", "skill set", "skillset",
               "technical expertise"),
    "experience": ("experience", "work experience", "professional experience", "employment", "employment history",
                   "work history", "internships", "internship", "internship experience", "relevant experience",
                   "industry experience"),
    "projects": ("projects", "personal projects", "academic projects", "key projects", "selected projects",
                 "technical projects", "project experience", "projects and portfolio", "portfolio"),
    "certifications": ("certifications", "certification", "certificates", "licenses and certifications",
                       "courses and certifications", "certifications and courses", "courses", "training"),
    "achievements": ("achievements", "awards", "honors", "honours", "awards and achievements", "accomplishments",
                     "awards and honors"),
    "other": ("publications", "volunteer", "volunteering", "volunteer experience", "interests", "hobbies", "languages",
              "extracurricular activities", "extracurriculars", "leadership", "activities", "positions of responsibility"),
}
CORE_SECTIONS = ("education", "skills", "experience", "projects")
SECTION_LABELS = {
    "header": "Header", "summary": "Summary", "education": "Education", "skills": "Skills",
    "experience": "Experience", "projects": "Projects", "certifications": "Certifications",
    "achievements": "Achievements", "other": "Other",
}

_MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_MONTH_RE = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_DATE_RE = rf"(?:{_MONTH_RE}\.?\s*,?\s*(\d{{4}})|(\d{{1,2}})/(\d{{4}})|(\d{{4}}))"
_RANGE_RE = re.compile(
    rf"{_DATE_RE}\s*(?:-|–|—|to|until)\s*(?:{_DATE_RE}|(present|current|now|ongoing|till date|today))",
    re.IGNORECASE,
)
_TITLE_SPLIT_RE = re.compile(r"\s+(?:\||–|—|-|:)\s+|\s*\|\s*|:\s+|\s+\(")


@dataclass
class Entry:
    """A project or experience entry."""

    title: str
    header: str
    body: list[str] = field(default_factory=list)
    section: str = "projects"

    @property
    def text(self) -> str:
        return "\n".join([self.header, *self.body]).strip()

    @property
    def units(self) -> list[str]:
        """Bullet-level text units for embedding (header included for context)."""
        units = [b for b in self.body if word_count(b) >= 3]
        return units or [self.header]


@dataclass
class DateRange:
    start: date
    end: date
    text: str

    @property
    def months(self) -> int:
        return max(0, (self.end.year - self.start.year) * 12 + self.end.month - self.start.month + 1)


@dataclass
class ResumeDocument:
    text: str
    sections: list[Section]
    projects: list[Entry]
    experience: list[Entry]

    def lines(self) -> list[LineRef]:
        refs: list[LineRef] = []
        idx = 0
        for sec in self.sections:
            for ln in sec.lines:
                refs.append(LineRef(section=sec.key, text=ln, index=idx))
                idx += 1
        return refs

    def section_keys(self) -> list[str]:
        keys: list[str] = []
        for s in self.sections:
            if s.key not in keys and s.text:
                keys.append(s.key)
        return keys

    def section_text(self, *keys: str) -> str:
        return "\n".join(s.text for s in self.sections if s.key in keys).strip()

    def missing_core_sections(self) -> list[str]:
        present = set(self.section_keys())
        return [k for k in CORE_SECTIONS if k not in present]


def _looks_like_title(line: str, prev_was_body: bool, first: bool) -> bool:
    if is_bullet(line):
        return False
    words = word_count(line)
    if words == 0 or not (first or prev_was_body):
        return False
    if line[0].islower():
        return False
    if first:
        return True
    if _RANGE_RE.search(line) and words <= 20:
        return True
    if words > 16:
        return False
    ends_sentence = line.rstrip().endswith(".")
    has_separator = bool(re.search(r"\s[|–—-]\s|\|", line))
    return has_separator or not ends_sentence


def _entry_title(header: str) -> str:
    cleaned = _RANGE_RE.sub("", header).strip(" |–—-,")
    title = _TITLE_SPLIT_RE.split(cleaned, maxsplit=1)[0].strip(" |–—-:,")
    return title[:120] or header[:120]


def parse_entries(section_lines: list[str], section_key: str) -> list[Entry]:
    """Group a section's lines into entries: a title line followed by details."""
    entries: list[Entry] = []
    prev_body = True
    for raw in section_lines:
        line = raw.strip()
        if not line:
            prev_body = True
            continue
        if _looks_like_title(line, prev_body, first=not entries):
            entries.append(Entry(title=_entry_title(line), header=line, section=section_key))
            prev_body = False
            continue
        if not entries:
            entries.append(Entry(title=_entry_title(line), header=line, section=section_key))
            prev_body = False
            continue
        if not is_bullet(line) and line[0].islower() and entries[-1].body:
            # Wrapped continuation of the previous bullet (common in PDF extraction).
            entries[-1].body[-1] = f"{entries[-1].body[-1]} {line}"
            continue
        entries[-1].body.append(strip_bullet(line))
        prev_body = True
    return [e for e in entries if e.title]


def parse_resume(text: str) -> ResumeDocument:
    norm = normalize_text(text)
    sections = split_sections(norm, RESUME_HEADINGS, default_key="header")
    projects: list[Entry] = []
    experience: list[Entry] = []
    for sec in sections:
        if sec.key == "projects":
            projects.extend(parse_entries(sec.lines, "projects"))
        elif sec.key == "experience":
            experience.extend(parse_entries(sec.lines, "experience"))
    return ResumeDocument(text=norm, sections=sections, projects=projects, experience=experience)


def _parse_date(month_name: str | None, year_a: str | None, month_num: str | None, year_b: str | None,
                year_only: str | None, is_end: bool) -> date | None:
    try:
        if year_a:
            return date(int(year_a), _MONTHS[month_name[:3].lower()], 1)  # type: ignore[index]
        if year_b and month_num and 1 <= int(month_num) <= 12:
            return date(int(year_b), int(month_num), 1)
        if year_only:
            return date(int(year_only), 12 if is_end else 1, 1)
    except (ValueError, KeyError):
        return None
    return None


def find_date_ranges(text: str, reference: date) -> list[DateRange]:
    ranges: list[DateRange] = []
    for m in _RANGE_RE.finditer(text):
        g = m.groups()
        start = _parse_date(g[0], g[1], g[2], g[3], g[4], is_end=False)
        if g[10]:
            end: date | None = date(reference.year, reference.month, 1)
        else:
            end = _parse_date(g[5], g[6], g[7], g[8], g[9], is_end=True)
        if not start or not end or end < start or start.year < 1970 or end > date(reference.year + 1, 12, 1):
            continue
        ranges.append(DateRange(start=start, end=end, text=m.group(0)))
    return ranges


def estimate_experience_months(ranges: list[DateRange]) -> int:
    """Total months covered by the ranges, merging overlaps so time is not double counted."""
    if not ranges:
        return 0
    spans = sorted((r.start.year * 12 + r.start.month, r.end.year * 12 + r.end.month) for r in ranges)
    total = 0
    cur_s, cur_e = spans[0]
    for s, e in spans[1:]:
        if s <= cur_e + 1:
            cur_e = max(cur_e, e)
        else:
            total += cur_e - cur_s + 1
            cur_s, cur_e = s, e
    total += cur_e - cur_s + 1
    return total
