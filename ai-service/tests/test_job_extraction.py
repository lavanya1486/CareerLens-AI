import pytest

from app.errors import InvalidInputError
from app.nlp.job import apply_overrides, parse_job_description
from app.schemas import RequirementOverride


def parse(text, taxonomy):
    return parse_job_description(text, taxonomy, max_chars=20000, min_words=25)


def test_required_and_preferred_are_distinguished(java_jd, taxonomy):
    reqs = {r.skill: r for r in parse(java_jd, taxonomy).requirements.skills}
    for s in ("Java", "Spring Boot", "PostgreSQL", "Git", "Maven", "REST APIs", "Object-Oriented Programming"):
        assert reqs[s].importance == "required", s
    for s in ("React", "AWS", "Docker", "Apache Kafka"):
        assert reqs[s].importance == "preferred", s


def test_alternatives_are_grouped_and_not_double_counted(java_jd, taxonomy):
    reqs = {r.skill: r for r in parse(java_jd, taxonomy).requirements.skills}
    assert reqs["Hibernate"].alternatives == ["JPA"]
    assert "JPA" not in reqs
    assert reqs["Docker"].alternatives == ["Kubernetes"]
    assert reqs["Apache Kafka"].alternatives == ["RabbitMQ"]


def test_benefits_and_about_sections_are_ignored(taxonomy):
    jd = ("Backend Engineer\n\nAbout us\nWe are a Python shop that loves Kubernetes.\n\nRequirements\n- Experience building REST APIs with Java "
          "and Spring Boot for production systems.\n- Solid SQL skills.\n\nBenefits\n- Free AWS credits and team lunches every week.")
    names = {r.skill for r in parse(jd, taxonomy).requirements.skills}
    assert {"Java", "Spring Boot", "REST APIs", "SQL"} <= names
    assert not names & {"Python", "Kubernetes", "AWS"}


def test_inline_preferred_cue_overrides_required_section(taxonomy):
    jd = ("Requirements\n- Strong Java knowledge and experience writing clean backend services for customers.\n"
          "- Knowledge of GraphQL is a plus.\n- Must know SQL and relational modelling for reporting workloads.")
    reqs = {r.skill: r.importance for r in parse(jd, taxonomy).requirements.skills}
    assert reqs == {"Java": "required", "GraphQL": "preferred", "SQL": "required"}


def test_experience_education_certifications_and_responsibilities(ml_jd, java_jd, taxonomy):
    ml = parse(ml_jd, taxonomy).requirements
    assert ml.experience[0].min_years == 2
    assert any("Master" in e for e in ml.education)
    assert any("Certified" in c for c in ml.certifications)
    assert len(ml.responsibilities) == 4
    java = parse(java_jd, taxonomy).requirements
    assert java.experience[0].min_years == 0 and java.experience[0].max_years == 1
    assert java.suggested_title == "Java Backend Developer Intern"
    assert {c.skill for c in java.competencies} >= {"Communication", "Problem Solving"}


def test_common_words_are_not_treated_as_skills(java_jd, taxonomy):
    names = {r.skill for r in parse(java_jd, taxonomy).requirements.skills}
    assert all(n not in names for n in ("Go", "R", "C", "Spring Framework", "Render"))


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("", "EMPTY_JOB_DESCRIPTION"),
        ("Java developer needed.", "JOB_DESCRIPTION_TOO_SHORT"),
        ("x " * 30000, "JOB_DESCRIPTION_TOO_LONG"),
        ("The weather today is lovely and the birds are singing in the trees while the children play outside in "
         "the park near the old river bridge and everyone seems happy.", "NOT_A_JOB_DESCRIPTION"),
    ],
    ids=["empty", "too_short", "too_long", "not_a_job_description"],
)
def test_invalid_job_descriptions(text, code, taxonomy):
    with pytest.raises(InvalidInputError) as exc:
        parse(text, taxonomy)
    assert exc.value.code == code


def test_resume_pasted_as_job_description_is_flagged(resume_text, taxonomy):
    assert any("resume" in w for w in parse(resume_text, taxonomy).requirements.warnings)


def test_user_overrides_replace_extracted_requirements(java_jd, taxonomy):
    parsed = parse(java_jd, taxonomy)
    reqs = apply_overrides(parsed, [
        RequirementOverride(skill="postgres", importance="required"),
        RequirementOverride(skill="Spring WebFlux", importance="preferred"),
        RequirementOverride(skill="React", importance="required", alternatives=["Angular"]),
    ], taxonomy)
    by = {r.skill: r for r in reqs}
    assert by["PostgreSQL"].importance == "required" and not by["PostgreSQL"].custom
    assert by["Spring WebFlux"].custom and by["Spring WebFlux"].category == "custom"
    assert by["React"].alternatives == ["Angular"]
    assert "Java" not in by
