from datetime import date

from app.nlp.resume import estimate_experience_months, find_date_ranges, parse_entries, parse_resume
from app.nlp.text import normalize_text, split_sections, strip_bullet


def test_normalize_keeps_line_structure_and_collapses_spaces():
    raw = "Name\r\n\r\n\r\n\r\nSKILLS:\u00a0\u00a0Java,\t Python\n\n\n• Built   APIs\u200b"
    out = normalize_text(raw)
    assert out == "Name\n\nSKILLS: Java, Python\n\n• Built APIs"


def test_normalize_handles_ligatures_and_quotes():
    assert normalize_text("ﬁnance \u2019quoted\u2019") == "finance 'quoted'"
    assert normalize_text("") == ""


def test_section_detection_identifies_core_sections(resume_text):
    doc = parse_resume(resume_text)
    keys = doc.section_keys()
    for k in ("summary", "education", "skills", "experience", "projects", "certifications"):
        assert k in keys
    assert doc.missing_core_sections() == []


def test_missing_sections_are_reported_gracefully():
    doc = parse_resume("Jane Doe\nI write Java code and enjoy building backend systems with Spring Boot every day.")
    assert set(doc.missing_core_sections()) == {"education", "skills", "experience", "projects"}
    assert doc.projects == []


def test_projects_are_split_into_entries(resume_text):
    doc = parse_resume(resume_text)
    titles = [p.title for p in doc.projects]
    assert titles == ["Campus Library Management System", "Expense Splitter Web App", "Sentiment Analyzer for Product Reviews"]
    assert len(doc.projects[0].body) == 3
    assert doc.projects[0].body[0].startswith("Designed a RESTful backend")


def test_wrapped_bullet_lines_are_merged():
    entries = parse_entries(["Weather App | React", "- Built a dashboard that shows", "forecasts for 5 cities."], "projects")
    assert len(entries) == 1
    assert entries[0].body == ["Built a dashboard that shows forecasts for 5 cities."]


def test_headings_with_variants_and_colons():
    secs = split_sections("TECHNICAL SKILLS:\nJava\nWork Experience\nIntern", {"skills": ("technical skills",), "experience": ("work experience",)}, "header")
    assert [s.key for s in secs] == ["skills", "experience"]


def test_date_ranges_and_overlap_merging():
    ref = date(2026, 10, 1)
    text = "Intern  Jun 2025 - Aug 2025\nPart-time Jul 2025 – Present\nTA 01/2024 to 05/2024"
    ranges = find_date_ranges(text, ref)
    assert len(ranges) == 3
    # Jun 2025..Oct 2026 merged (17 months) + Jan..May 2024 (5 months)
    assert estimate_experience_months(ranges) == 22


def test_invalid_date_ranges_are_ignored():
    assert find_date_ranges("2025 - 2019", date(2026, 1, 1)) == []
    assert estimate_experience_months([]) == 0


def test_strip_bullet_variants():
    for b in ("• item", "- item", "* item", "1. item", "(2) item", "▪ item"):
        assert strip_bullet(b) == "item"
