import pytest

from app.nlp.skills import LineRef, extract_from_lines
from app.nlp.taxonomy import build_taxonomy


def found(text, taxonomy, section="experience"):
    hits = extract_from_lines([LineRef(section, text, 0)], taxonomy)
    return {n for n, h in hits.items() if h.is_confirmed}


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Strong Java programming skills", "Java"),
        ("Stored data in Postgres", "PostgreSQL"),
        ("Front end in JS and HTML", "JavaScript"),
        ("Built services with SpringBoot", "Spring Boot"),
        ("Built services with Spring-Boot", "Spring Boot"),
        ("Trained models using sklearn", "scikit-learn"),
        ("Deployed on K8s", "Kubernetes"),
        ("Created RESTful services", "REST APIs"),
        ("Applied OOP principles", "Object-Oriented Programming"),
        ("Used Golang for CLIs", "Go"),
    ],
)
def test_alias_normalisation(text, expected, taxonomy):
    assert expected in found(text, taxonomy)


def test_distinct_technologies_are_not_merged(taxonomy):
    skills = found("Built UIs in JavaScript and TypeScript", taxonomy)
    assert "Java" not in skills
    assert {"JavaScript", "TypeScript"} <= skills
    assert found("Wrote C++ and C# code", taxonomy) == {"C++", "C#"}
    assert "Spring Framework" not in found("Built APIs with Spring Boot", taxonomy)
    assert found("Used MySQL", taxonomy) == {"MySQL"}  # never PostgreSQL


def test_longest_alias_claims_span(taxonomy):
    hits = extract_from_lines([LineRef("skills", "Spring Boot, Node.js", 0)], taxonomy)
    assert set(hits) == {"Spring Boot", "Node.js"}


def test_ambiguous_words_need_context(taxonomy):
    assert "Go" not in found("Ready to go the extra mile", taxonomy)
    assert "Go" not in found("Go to market strategy for products", taxonomy)
    assert "Go" in found("Languages: Java, Go, Python", taxonomy, section="skills")
    assert "Go" in found("Wrote services in Java and Go.", taxonomy)
    assert "R" in found("Statistical analysis in Python, R, SQL", taxonomy, section="skills")
    assert "Spring Framework" not in found("Spring internship in 2024", taxonomy)


def test_ambiguous_unconfirmed_mention_is_kept_for_review(taxonomy):
    hits = extract_from_lines([LineRef("experience", "Go beyond expectations daily", 0)], taxonomy)
    assert "Go" in hits and not hits["Go"].is_confirmed


def test_lowercase_common_words_do_not_trigger_case_sensitive_skills(taxonomy):
    assert "Swift" not in found("swift delivery of features", taxonomy)
    assert "Rust" not in found("removed rust from old machines", taxonomy)
    assert "Machine Learning" not in found("5 ml of solution", taxonomy)


def test_taxonomy_rejects_duplicates_and_unknown_implications():
    base = {"name": "A", "category": "language", "aliases": [], "families": [], "implies": [], "ambiguous_aliases": []}
    with pytest.raises(ValueError):
        build_taxonomy({"skills": [base, dict(base)]})
    with pytest.raises(ValueError):
        build_taxonomy({"skills": [dict(base, implies=["Missing"])]})


def test_new_skills_can_be_added_via_data_only():
    tax = build_taxonomy({"version": "t", "skills": [
        {"name": "Zig", "category": "language", "aliases": ["ziglang"], "families": [], "implies": [], "ambiguous_aliases": []}
    ]})
    hits = extract_from_lines([LineRef("skills", "Hobby work in ziglang", 0)], tax)
    assert set(hits) == {"Zig"}


def test_lookup_resolves_aliases(taxonomy):
    assert taxonomy.lookup("postgres").name == "PostgreSQL"
    assert taxonomy.lookup("springboot").name == "Spring Boot"
    assert taxonomy.lookup("not-a-skill") is None
