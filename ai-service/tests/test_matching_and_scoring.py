from datetime import date

import pytest

from app.nlp.matching import match_requirement
from app.nlp.scoring import ComponentInput, combine, config_from_dict, load_scoring_config, score_band
from app.nlp.skills import LineRef, extract_from_lines
from app.schemas import AnalyzeRequest, RequirementOverride, RequirementSkill


def req(skill, importance="required", alternatives=None, category="language"):
    return RequirementSkill(skill=skill, category=category, category_label="x", importance=importance,
                            alternatives=alternatives or [], evidence=f"Experience with {skill}", confidence=0.9)


def lines_of(*pairs):
    return [LineRef(section, text, i) for i, (section, text) in enumerate(pairs)]


def run(r, lines, taxonomy, scoring):
    hits = extract_from_lines(lines, taxonomy)
    return match_requirement(r, hits, lines, taxonomy, scoring)


def test_demonstrated_match_with_evidence(taxonomy, scoring):
    lines = lines_of(("skills", "Java, SQL"), ("experience", "Built REST APIs in Java for 40 analysts."))
    m = run(req("Java"), lines, taxonomy, scoring)
    assert m.status == "matched" and m.credit == 1.0 and m.evidence_strength == "demonstrated"
    assert m.resume_evidence[0].text == "Built REST APIs in Java for 40 analysts."
    assert m.resume_evidence[0].section == "experience"


def test_listed_only_match_is_weaker_evidence(taxonomy, scoring):
    m = run(req("Maven", category="tool"), lines_of(("skills", "Tools: Git, Maven")), taxonomy, scoring)
    assert m.status == "matched" and m.evidence_strength == "listed"


def test_related_technology_is_partial_not_full(taxonomy, scoring):
    m = run(req("PostgreSQL", category="database"), lines_of(("experience", "Optimised MySQL queries.")), taxonomy, scoring)
    assert m.status == "partial"
    assert m.credit == pytest.approx(scoring.partial_credit)
    assert m.related_resume_skills == ["MySQL"]
    assert "distinct" in m.reasoning


def test_implied_skill_is_partial(taxonomy, scoring):
    m = run(req("SQL"), lines_of(("experience", "Designed schemas in PostgreSQL.")), taxonomy, scoring)
    assert m.status == "partial" and "PostgreSQL" in m.related_resume_skills


def test_alternative_satisfies_requirement(taxonomy, scoring):
    m = run(req("Hibernate", alternatives=["JPA"], category="framework"),
            lines_of(("projects", "Persisted entities with JPA repositories.")), taxonomy, scoring)
    assert m.status == "matched" and m.matched_via == "JPA"


def test_missing_skill_states_document_limitation(taxonomy, scoring):
    m = run(req("Kubernetes", category="devops"), lines_of(("experience", "Built Java services.")), taxonomy, scoring)
    assert m.status == "missing" and m.credit == 0
    assert "does not prove" in m.reasoning


def test_ambiguous_mention_needs_review_without_credit(taxonomy, scoring):
    m = run(req("Go"), lines_of(("experience", "Go beyond expectations for every customer.")), taxonomy, scoring)
    assert m.status == "review" and m.credit == 0


def test_custom_requirement_literal_match(taxonomy, scoring):
    r = req("Spring WebFlux", category="custom").model_copy(update={"custom": True})
    m = run(r, lines_of(("projects", "Built reactive endpoints with Spring WebFlux.")), taxonomy, scoring)
    assert m.status == "matched"


def test_combine_redistributes_unavailable_weights(scoring):
    comps = [
        ComponentInput("required_skills", 1.0, True, ""), ComponentInput("preferred_skills", 0.0, False, ""),
        ComponentInput("semantic", 1.0, True, ""), ComponentInput("projects", 1.0, True, ""),
        ComponentInput("experience", 1.0, True, ""), ComponentInput("evidence", 1.0, True, ""),
    ]
    overall, results, lines = combine(comps, scoring)
    assert overall == 100.0
    assert sum(r.effective_weight for r in results) == pytest.approx(1.0, abs=1e-3)
    pref = next(r for r in results if r.key == "preferred_skills")
    assert pref.effective_weight == 0 and not pref.available
    assert "redistributed" in " ".join(lines)


def test_combine_is_bounded_and_weighted(scoring):
    comps = [ComponentInput(k, v, True, "") for k, v in [
        ("required_skills", 0.5), ("preferred_skills", 0.0), ("semantic", 0.5), ("projects", 0.0),
        ("experience", 2.0), ("evidence", -1.0)]]
    overall, results, _ = combine(comps, scoring)
    expected = 50 * 0.35 + 50 * 0.20 + 100 * 0.10
    assert overall == pytest.approx(expected, abs=0.1)
    assert all(0 <= r.score <= 100 for r in results)


def test_scoring_config_validation():
    raw = load_scoring_config().__dict__.copy()
    with pytest.raises(ValueError):
        config_from_dict({**raw, "weights": {**raw["weights"], "semantic": 0.9}})
    with pytest.raises(ValueError):
        config_from_dict({**raw, "partial_credit": 1.5})


def test_calibration_and_bands(scoring):
    assert scoring.calibrate(0.0) == 0.0
    assert scoring.calibrate(0.95) == 1.0
    assert 0 < scoring.calibrate(0.45) < 1
    assert score_band(80) == "strong" and score_band(60) == "good" and score_band(40) == "partial" and score_band(10) == "limited"


def test_full_analysis_shape_and_bounds(analyzer, resume_text, java_jd):
    res = analyzer.analyze(AnalyzeRequest(resume_text=resume_text, job_description=java_jd, reference_date=date(2026, 10, 1)))
    assert 0 <= res.overall_score <= 100
    assert [c.key for c in res.components] == ["required_skills", "preferred_skills", "semantic", "projects", "experience", "evidence"]
    assert sum(c.contribution for c in res.components) == pytest.approx(res.overall_score, abs=0.1)
    assert res.scoring_version == "1.0.0" and res.input_fingerprint
    assert res.projects[0].name == "Campus Library Management System"
    assert res.experience.status == "met"
    # Each requirement appears exactly once.
    names = [m.skill for m in res.skill_matches]
    assert len(names) == len(set(names))


def test_analysis_is_deterministic(analyzer, resume_text, java_jd):
    r = AnalyzeRequest(resume_text=resume_text, job_description=java_jd, reference_date=date(2026, 10, 1))
    a, b = analyzer.analyze(r), analyzer.analyze(r)
    assert a.model_dump() == b.model_dump()


def test_semantic_similarity_never_credits_missing_skills(analyzer, java_jd):
    resume = ("SUMMARY\nBackend developer.\nEXPERIENCE\nIntern | Acme  Jan 2025 - Jun 2025\n"
              "- Worked on container orchestration clusters and deployment pipelines for many services.\n"
              "- Wrote software and documentation for internal teams and helped with releases every sprint.")
    res = analyzer.analyze(AnalyzeRequest(resume_text=resume, job_description=java_jd, reference_date=date(2026, 1, 1)))
    k8s = next(m for m in res.skill_matches if m.skill == "Docker")
    assert k8s.status == "missing" and k8s.credit == 0


def test_no_projects_yields_empty_state_recommendation(analyzer, java_jd):
    resume = ("SUMMARY\nJava developer who enjoys Spring Boot.\nSKILLS\nJava, Spring Boot, Git, Maven\nEXPERIENCE\n"
              "Developer | Acme  Jan 2024 - Jan 2025\n- Built REST APIs with Spring Boot and wrote JUnit tests for them daily.")
    res = analyzer.analyze(AnalyzeRequest(resume_text=resume, job_description=java_jd, reference_date=date(2026, 1, 1)))
    assert res.projects == []
    proj = next(c for c in res.components if c.key == "projects")
    assert proj.score == 0 and "No projects" in proj.explanation
    assert any(r.title == "Add a projects section" for r in res.recommendations)


def test_overrides_flow_through_analysis(analyzer, resume_text, java_jd):
    res = analyzer.analyze(AnalyzeRequest(resume_text=resume_text, job_description=java_jd, requirements=[
        RequirementOverride(skill="Java", importance="required"),
        RequirementOverride(skill="Rust", importance="preferred"),
    ], reference_date=date(2026, 1, 1)))
    assert [m.skill for m in res.skill_matches] == ["Java", "Rust"]
    assert next(c for c in res.components if c.key == "required_skills").score == 100.0


def test_recommendations_are_grounded(analyzer, resume_text, java_jd):
    res = analyzer.analyze(AnalyzeRequest(resume_text=resume_text, job_description=java_jd, reference_date=date(2026, 1, 1)))
    assert res.recommendations
    for r in res.recommendations:
        assert r.grounding, r.title
    for p in res.projects:
        for f in p.future_improvements:
            assert f.startswith("Possible future enhancement") and "after you have built it" in f
