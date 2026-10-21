"""Text normalisation, line handling and heading-based section detection."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

BULLET_CHARS = "•●▪◦‣∙·○■□➢➤►-–—*"
_BULLET_RE = re.compile(r"^\s*(?:[" + re.escape(BULLET_CHARS) + r"]|\(?\d{1,2}[.)])\s+")
_CONTROL_RE = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\ufeff]")
_MULTI_SPACE_RE = re.compile(r"[ \t\u00a0]+")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?;])\s+(?=[A-Z0-9(])")
_LIGATURES = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"'}


def normalize_text(text: str) -> str:
    """Normalise unicode and whitespace while keeping line breaks and paragraph gaps.

    Line structure carries meaning in resumes (headings, bullets), so only horizontal
    whitespace is collapsed and runs of 3+ blank lines are reduced to one blank line.
    """
    if not text:
        return ""
    for lig, rep in _LIGATURES.items():
        text = text.replace(lig, rep)
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_RE.sub("", text)
    lines = [_MULTI_SPACE_RE.sub(" ", ln).strip() for ln in text.split("\n")]
    out: list[str] = []
    blank = 0
    for ln in lines:
        if not ln:
            blank += 1
            if blank == 1 and out:
                out.append("")
            continue
        blank = 0
        out.append(ln)
    while out and not out[-1]:
        out.pop()
    return "\n".join(out)


def is_bullet(line: str) -> bool:
    return bool(_BULLET_RE.match(line))


def strip_bullet(line: str) -> str:
    return _BULLET_RE.sub("", line).strip()


def split_sentences(text: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE_SPLIT_RE.split(text) if p.strip()]
    return parts


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9+#.]+", text))


def truncate(text: str, limit: int = 240) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


@dataclass
class Section:
    key: str
    heading: str | None
    lines: list[str] = field(default_factory=list)
    start_line: int = 0

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()


def _clean_heading(line: str) -> str:
    h = line.strip().strip(":").strip()
    h = re.sub(r"^[#=*_\-\s]+|[#=*_\-\s]+$", "", h)
    return re.sub(r"\s+", " ", h).lower().replace("&", "and")


def detect_heading(line: str, heading_map: dict[str, tuple[str, ...]]) -> str | None:
    """Return the section key if ``line`` looks like a heading in ``heading_map``."""
    if not line or len(line) > 60 or is_bullet(line):
        return None
    words = line.split()
    if len(words) > 6:
        return None
    cleaned = _clean_heading(line)
    if not cleaned:
        return None
    for key, variants in heading_map.items():
        for v in variants:
            if cleaned == v:
                return key
    # Headings like "Projects (Selected)" or "TECHNICAL SKILLS:" with a suffix.
    if line.rstrip().endswith(":") or line.isupper():
        for key, variants in heading_map.items():
            for v in variants:
                if cleaned.startswith(v + " ") or cleaned.startswith(v + "("):
                    return key
    return None


def split_sections(text: str, heading_map: dict[str, tuple[str, ...]], default_key: str) -> list[Section]:
    """Split normalised text into sections using known headings.

    Content before the first heading becomes ``default_key``. Repeated headings are
    kept as separate Section objects so their order is preserved.
    """
    sections: list[Section] = [Section(key=default_key, heading=None, start_line=0)]
    for idx, line in enumerate(text.split("\n")):
        key = detect_heading(line, heading_map)
        if key:
            sections.append(Section(key=key, heading=line.strip().strip(":"), start_line=idx))
        else:
            sections[-1].lines.append(line)
    return [s for s in sections if s.heading is not None or s.text]
