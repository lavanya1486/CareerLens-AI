"""Skill taxonomy: canonical names, aliases, categories and relationships.

The taxonomy lives in ``app/data/skills_taxonomy.json``. Adding a skill or alias only
requires editing that file - the extraction engine compiles patterns from it.

Fields per skill:
- ``name``: canonical display name (unique).
- ``category``: language, framework, library, database, tool, cloud, devops, testing,
  concept, ai_ml, methodology or competency.
- ``aliases``: alternative spellings that are *equivalent* to the canonical skill.
- ``families``: groups of related-but-distinct technologies (e.g. relational databases).
  Sharing a family yields at most a PARTIAL match, never a full match.
- ``implies``: skills that are usually exercised when using this one (e.g. PostgreSQL
  implies SQL). Also only ever a PARTIAL match.
- ``ambiguous_aliases``: tokens that are also ordinary words ("Go", "R", "Spring").
  They are matched case-sensitively and only accepted with supporting context.
- ``case_sensitive``: match every alias case-sensitively (e.g. "Swift", "Rust").
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

TECHNICAL_CATEGORIES = frozenset(
    {"language", "framework", "library", "database", "tool", "cloud", "devops", "testing", "concept", "ai_ml", "methodology"}
)
CATEGORY_LABELS = {
    "language": "Programming language",
    "framework": "Framework",
    "library": "Library",
    "database": "Database",
    "tool": "Development tool",
    "cloud": "Cloud / hosting",
    "devops": "DevOps / deployment",
    "testing": "Testing",
    "concept": "Engineering concept",
    "ai_ml": "AI / ML",
    "methodology": "Methodology",
    "competency": "Competency",
}


@dataclass(frozen=True)
class SkillDef:
    name: str
    category: str
    aliases: tuple[str, ...]
    families: tuple[str, ...]
    implies: tuple[str, ...]
    ambiguous_aliases: tuple[str, ...]
    case_sensitive: bool = False

    @property
    def is_technical(self) -> bool:
        return self.category in TECHNICAL_CATEGORIES


@dataclass(frozen=True)
class AliasPattern:
    skill: SkillDef
    alias: str
    regex: re.Pattern[str]
    ambiguous: bool


@dataclass
class Taxonomy:
    version: str
    skills: dict[str, SkillDef]
    family_descriptions: dict[str, str]
    patterns: list[AliasPattern] = field(default_factory=list)

    def get(self, name: str) -> SkillDef | None:
        return self.skills.get(name)

    def lookup(self, text: str) -> SkillDef | None:
        """Resolve free text (canonical name or alias, case-insensitive) to a skill."""
        needle = text.strip().lower()
        if not needle:
            return None
        for s in self.skills.values():
            if s.name.lower() == needle or needle in (a.lower() for a in s.aliases + s.ambiguous_aliases):
                return s
        return None

    def family_label(self, family: str) -> str:
        return self.family_descriptions.get(family, family.replace("-", " "))


def _alias_regex(alias: str, case_sensitive: bool) -> re.Pattern[str]:
    words = [w for w in re.split(r"[\s\-]+", alias.strip()) if w]
    body = r"[\s\-]?".join(re.escape(w) for w in words)
    single_char = len(alias) == 1
    left = r"(?<![A-Za-z0-9+#.@_\-])" if single_char else r"(?<![A-Za-z0-9+#.@_])"
    right = r"(?![A-Za-z0-9+#_]|\.[A-Za-z0-9])"
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.compile(left + body + right, flags)


def build_taxonomy(raw: dict) -> Taxonomy:
    skills: dict[str, SkillDef] = {}
    for item in raw["skills"]:
        sd = SkillDef(
            name=item["name"],
            category=item["category"],
            aliases=tuple(item.get("aliases", [])),
            families=tuple(item.get("families", [])),
            implies=tuple(item.get("implies", [])),
            ambiguous_aliases=tuple(item.get("ambiguous_aliases", [])),
            case_sensitive=bool(item.get("case_sensitive", False)),
        )
        if sd.name in skills:
            raise ValueError(f"Duplicate skill in taxonomy: {sd.name}")
        skills[sd.name] = sd
    for sd in skills.values():
        for imp in sd.implies:
            if imp not in skills:
                raise ValueError(f"{sd.name} implies unknown skill {imp}")

    patterns: list[AliasPattern] = []
    seen: set[tuple[str, str]] = set()
    for sd in skills.values():
        candidates: list[tuple[str, bool]] = []
        if sd.name not in sd.ambiguous_aliases:
            candidates.append((sd.name, False))
        candidates += [(a, False) for a in sd.aliases]
        candidates += [(a, True) for a in sd.ambiguous_aliases]
        for alias, ambiguous in candidates:
            key = (sd.name, alias.lower() if not ambiguous else alias)
            if key in seen:
                continue
            seen.add(key)
            cs = ambiguous or sd.case_sensitive or len(alias) <= 2
            patterns.append(AliasPattern(sd, alias, _alias_regex(alias, cs), ambiguous))
    # Longest aliases first so "Spring Boot" claims its span before "Spring".
    patterns.sort(key=lambda p: (-len(p.alias), p.skill.name))
    return Taxonomy(
        version=raw.get("version", "unversioned"),
        skills=skills,
        family_descriptions=raw.get("family_descriptions", {}),
        patterns=patterns,
    )


@lru_cache(maxsize=4)
def load_taxonomy(path: str) -> Taxonomy:
    with Path(path).open(encoding="utf-8") as fh:
        return build_taxonomy(json.load(fh))
