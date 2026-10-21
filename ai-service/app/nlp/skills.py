"""Taxonomy-driven skill extraction with evidence and ambiguity handling."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.nlp.taxonomy import SkillDef, Taxonomy

_DELIM_BEFORE = re.compile(r"(?:^|[,/|;:(•·]|\band|\bor|\bin|\bwith|\bincluding|\busing|\blike)\s*$", re.IGNORECASE)
_DELIM_AFTER = re.compile(r"^\s*(?:$|[,/|;)•·]|and\b|or\b|\.(?:\s|$)|\()", re.IGNORECASE)
_CONTEXT_WORDS = re.compile(
    r"\b(?:programming|language|languages|framework|frameworks|developer|golang|lang|stack|technologies|tech)\b",
    re.IGNORECASE,
)

SKILL_LIST_SECTIONS = frozenset({"skills"})


@dataclass(frozen=True)
class LineRef:
    """A line of a document together with its section key."""

    section: str
    text: str
    index: int


@dataclass
class SkillMention:
    skill: SkillDef
    matched_text: str
    line: LineRef
    ambiguous: bool
    accepted: bool
    start: int = 0
    end: int = 0


@dataclass
class SkillHits:
    """All mentions of one canonical skill within a document."""

    skill: SkillDef
    mentions: list[SkillMention] = field(default_factory=list)

    @property
    def accepted(self) -> list[SkillMention]:
        return [m for m in self.mentions if m.accepted]

    @property
    def is_confirmed(self) -> bool:
        return bool(self.accepted)

    @property
    def sections(self) -> set[str]:
        return {m.line.section for m in self.accepted}


def _accept_ambiguous(line: LineRef, start: int, end: int, has_other_skill: bool) -> bool:
    before = line.text[:start]
    after = line.text[end:]
    delim_before = bool(_DELIM_BEFORE.search(before))
    delim_after = bool(_DELIM_AFTER.match(after))
    if line.section in SKILL_LIST_SECTIONS and (delim_before or delim_after):
        return True
    if has_other_skill and delim_before and delim_after:
        return True
    window = line.text[max(0, start - 30) : end + 30]
    return bool(_CONTEXT_WORDS.search(window)) and (delim_before or delim_after)


def extract_from_lines(lines: list[LineRef], taxonomy: Taxonomy) -> dict[str, SkillHits]:
    """Find all taxonomy skills in ``lines``.

    Each character span can be claimed by only one alias (longest first), so
    "Spring Boot" is not also counted as "Spring", and "JavaScript" is never "Java".
    """
    hits: dict[str, SkillHits] = {}
    for line in lines:
        if not line.text.strip():
            continue
        claimed: list[tuple[int, int]] = []
        found: list[tuple[int, int, SkillDef, str, bool]] = []
        for pat in taxonomy.patterns:
            for m in pat.regex.finditer(line.text):
                s, e = m.span()
                if any(s < ce and e > cs for cs, ce in claimed):
                    continue
                claimed.append((s, e))
                found.append((s, e, pat.skill, m.group(0), pat.ambiguous))
        unambiguous_count = sum(1 for f in found if not f[4])
        for s, e, skill, text, ambiguous in found:
            accepted = True
            if ambiguous:
                accepted = _accept_ambiguous(line, s, e, unambiguous_count > 0)
            hits.setdefault(skill.name, SkillHits(skill)).mentions.append(
                SkillMention(skill=skill, matched_text=text, line=line, ambiguous=ambiguous, accepted=accepted, start=s, end=e)
            )
    return hits
