#!/usr/bin/env python3
"""End-to-end API smoke test against a running CareerLens stack.

Usage:  python scripts/smoke_test.py [BASE_URL]        (default http://localhost:8082)

Uses only the Python standard library. Creates two throwaway users with random emails,
exercises the full resume -> analysis -> saved comparison -> report flow, verifies that a
second user cannot access the first user's data, and deletes both accounts at the end.
Exits non-zero on the first failed check.
"""
from __future__ import annotations

import http.cookiejar
import json
import sys
import uuid
from pathlib import Path
from urllib import error, request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8082").rstrip("/")
ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo-data"
PASSWORD = "Smoke-test-Passw0rd!"
results: list[tuple[str, bool, str]] = []


class Client:
    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = request.build_opener(request.HTTPCookieProcessor(self.jar))

    def cookie(self, name: str) -> str | None:
        return next((c.value for c in self.jar if c.name == name), None)

    def call(self, method: str, path: str, body=None, *, raw: bytes | None = None,
             content_type: str | None = None):
        headers = {"Accept": "application/json, application/pdf"}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        elif raw is not None:
            data = raw
            headers["Content-Type"] = content_type or "application/octet-stream"
        token = self.cookie("XSRF-TOKEN")
        if token and method not in ("GET", "HEAD"):
            headers["X-XSRF-TOKEN"] = token
        req = request.Request(BASE + path, data=data, method=method, headers=headers)
        try:
            with self.opener.open(req, timeout=90) as resp:
                return resp.status, resp.headers, resp.read()
        except error.HTTPError as e:
            return e.code, e.headers, e.read()

    def json(self, method: str, path: str, body=None, **kw):
        status, headers, payload = self.call(method, path, body, **kw)
        parsed = json.loads(payload) if payload and headers.get("Content-Type", "").startswith("application/json") else None
        return status, parsed

    def register(self, name: str):
        self.call("GET", "/api/v1/auth/csrf")
        email = f"smoke-{uuid.uuid4().hex[:10]}@example.test"
        return self.json("POST", "/api/v1/auth/register", {"fullName": name, "email": email, "password": PASSWORD})


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((name, condition, detail))
    print(f"[{'PASS' if condition else 'FAIL'}] {name}{' - ' + detail if detail else ''}")
    if not condition:
        summary()
        sys.exit(1)


def multipart(field: str, filename: str, content: bytes, mime: str) -> tuple[bytes, str]:
    boundary = "----careerlens" + uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def summary() -> None:
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")


def main() -> None:
    status, sysinfo = Client().json("GET", "/api/v1/system/status")
    check("system status reachable", status == 200, json.dumps(sysinfo))
    check("AI service model loaded", bool(sysinfo["aiService"]["modelLoaded"]), sysinfo["aiService"]["status"])

    anon = Client()
    status, _ = anon.json("GET", "/api/v1/comparisons")
    check("unauthenticated request rejected", status == 401, str(status))

    a = Client()
    status, me = a.register("Smoke Tester A")
    check("register user A", status == 201, str(status))
    status, _ = a.json("GET", "/api/v1/users/me")
    check("session cookie authenticates", status == 200)

    bad = Client()
    bad.call("GET", "/api/v1/auth/csrf")
    bad.jar.clear()  # drop CSRF cookie to prove the header alone is not enough
    status, _ = bad.json("POST", "/api/v1/auth/login", {"email": me["email"], "password": PASSWORD})
    check("state-changing request without CSRF token rejected", status == 403, str(status))

    pdf = (DEMO / "resume-ananya-rao.pdf").read_bytes()
    body, ctype = multipart("file", "resume-ananya-rao.pdf", pdf, "application/pdf")
    status, resume = a.json("POST", "/api/v1/resumes/upload", raw=body, content_type=ctype)
    check("upload PDF resume", status == 201, f"{status} chars={resume and resume.get('charCount')}")
    resume_id = resume["id"]

    body, ctype = multipart("file", "notes.pdf", b"This is plain text pretending to be a PDF.", "application/pdf")
    status, err = a.json("POST", "/api/v1/resumes/upload", raw=body, content_type=ctype)
    check("fake PDF rejected by magic-byte check", status == 415, f"{status} {err and err.get('code')}")

    edited = resume["content"] + "\nAdditional: Familiar with Git and Postman for API testing."
    status, updated = a.json("PUT", f"/api/v1/resumes/{resume_id}", {"title": "Ananya - backend", "content": edited})
    check("edit extracted resume text", status == 200 and updated["title"] == "Ananya - backend", str(status))

    jd = (DEMO / "job-java-backend-intern.txt").read_text()
    status, extracted = a.json("POST", "/api/v1/job-descriptions/extract", {"jobDescription": jd})
    reqs = extracted["skills"] if extracted else []
    check("extract JD requirements", status == 200 and len(reqs) > 0, f"{len(reqs)} requirements")

    overrides = [{"skill": r["skill"], "importance": r["importance"], "alternatives": r.get("alternatives", [])}
                 for r in reqs]
    status, draft = a.json("POST", "/api/v1/analyses", {
        "resumeId": resume_id, "jobDescription": jd, "jobTitle": "Java Backend Developer Intern",
        "company": "Northwind Fintech", "requirements": overrides})
    check("run analysis", status == 201, f"{status} score={draft and draft.get('overallScore')}")
    cid = draft["id"]
    check("analysis is an unsaved draft", draft["saved"] is False)

    status, saved = a.json("PATCH", f"/api/v1/comparisons/{cid}", {"saved": True, "name": "Smoke - Northwind"})
    check("save + rename comparison", status == 200 and saved["saved"] and saved["name"] == "Smoke - Northwind")

    status, page = a.json("GET", "/api/v1/comparisons?q=northwind&minScore=0&sort=overallScore,desc&size=5")
    check("search saved comparisons", status == 200 and page["totalElements"] == 1, str(page and page["totalElements"]))

    status, dash = a.json("GET", "/api/v1/dashboard")
    check("dashboard from DB", status == 200 and dash["totalComparisons"] == 1
          and float(dash["highestScore"]) == float(saved["overallScore"]),
          f"total={dash and dash['totalComparisons']} avg={dash and dash['averageScore']}")

    status, headers, pdf_bytes = a.call("GET", f"/api/v1/comparisons/{cid}/report.pdf")
    check("PDF report download", status == 200 and pdf_bytes[:5] == b"%PDF-"
          and "attachment" in headers.get("Content-Disposition", ""), f"{len(pdf_bytes)} bytes")
    status, headers, export = a.call("GET", f"/api/v1/comparisons/{cid}/export.json")
    check("JSON export", status == 200 and json.loads(export)["exportFormat"] == "careerlens.comparison.v1")

    b = Client()
    status, _ = b.register("Smoke Tester B")
    check("register user B", status == 201)
    for method, path in [("GET", f"/api/v1/comparisons/{cid}"), ("GET", f"/api/v1/comparisons/{cid}/report.pdf"),
                         ("GET", f"/api/v1/comparisons/{cid}/export.json"), ("DELETE", f"/api/v1/comparisons/{cid}"),
                         ("GET", f"/api/v1/resumes/{resume_id}")]:
        status, _, _ = b.call(method, path)
        check(f"user B denied {method} {path.split('/api/v1')[1]}", status == 404, str(status))
    status, _ = b.json("POST", "/api/v1/analyses", {"resumeId": resume_id, "jobDescription": jd})
    check("user B cannot analyse user A's resume", status == 404, str(status))
    status, bpage = b.json("GET", "/api/v1/comparisons")
    check("user B list is empty", status == 200 and bpage["totalElements"] == 0)

    status, _, _ = a.call("DELETE", f"/api/v1/comparisons/{cid}")
    check("delete comparison", status == 204)
    status, _, _ = a.call("GET", f"/api/v1/comparisons/{cid}")
    check("deleted comparison is gone", status == 404)

    for client in (a, b):
        status, _ = client.json("DELETE", "/api/v1/users/me", {"password": PASSWORD})
        check("delete test account", status == 204, str(status))
    summary()


if __name__ == "__main__":
    main()
