"""Records a real ComparisonDetail from a running stack (synthetic demo data) as a frontend test fixture.

Usage: python scripts/record_frontend_fixture.py [BASE_URL]
The temporary account is deleted afterwards.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke_test import DEMO, PASSWORD, ROOT, Client  # noqa: E402

OUT = ROOT / "frontend" / "src" / "test" / "fixtures" / "comparison-detail.json"


def main() -> None:
    c = Client()
    status, _ = c.register("Fixture Recorder")
    assert status == 201, status
    resume_text = (DEMO / "resume-ananya-rao.txt").read_text(encoding="utf-8")
    status, resume = c.json("POST", "/api/v1/resumes", {"title": "Ananya Rao - backend", "content": resume_text})
    assert status == 201, (status, resume)
    jd = (DEMO / "job-java-backend-intern.txt").read_text(encoding="utf-8")
    status, job = c.json("POST", "/api/v1/job-descriptions/extract", {"jobDescription": jd})
    assert status == 200, (status, job)
    reqs = [{"skill": s["skill"], "importance": s["importance"], "alternatives": s["alternatives"]} for s in job["skills"]]
    status, detail = c.json("POST", "/api/v1/analyses", {
        "resumeId": resume["id"], "jobDescription": jd, "jobTitle": "Java Backend Developer Intern",
        "company": "Northwind Labs", "requirements": reqs})
    assert status == 201, (status, detail)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(detail, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    c.json("DELETE", "/api/v1/users/me", {"password": PASSWORD})
    print(f"wrote {OUT.relative_to(ROOT)} score={detail['overallScore']} skills={len(detail['result']['skillMatches'])}")


if __name__ == "__main__":
    main()
