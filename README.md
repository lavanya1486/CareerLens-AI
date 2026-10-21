# CareerLens AI

CareerLens AI is a full-stack resume-to-job matching application. It extracts resume content, identifies job
requirements, compares evidence from the resume against those requirements, and presents an explainable match report.

## Product flow

1. Create an account and sign in.
2. Upload a PDF resume or enter resume text.
3. Review and edit the extracted resume content.
4. Submit a job description.
5. Review extracted required and preferred skills.
6. Run an explainable analysis.
7. Inspect scores, matched skills, gaps, evidence, recommendations, and project relevance.
8. Save, search, export, or download a PDF report.

## Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web client | React, TypeScript, Vite | Authentication, resume review, analysis workflow, charts, reports |
| API | Java 21, Spring Boot, Spring Security | Authentication, authorization, validation, persistence, orchestration |
| NLP service | Python 3.12+, FastAPI, FastEmbed | PDF extraction, parsing, embeddings, matching, scoring |
| Database | PostgreSQL 15+, Flyway, JPA | Users, resumes, comparisons, normalized skills, analysis results |

The browser talks only to the backend. The backend authenticates users, owns database access, and calls the AI service
with an internal API key. Uploaded PDFs are processed in memory and are not stored as files.

## Requirements

- Java 21
- Maven 3.9+
- Python 3.12 or newer
- Node.js 22.12 or newer
- PostgreSQL 15 or newer

## Windows quick start

See [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md) for complete setup, environment variables, database initialization, test
commands, and the full PowerShell workflow.

At a high level:

```powershell
# AI service
Set-Location .\ai-service
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt

# Backend
Set-Location ..\backend
mvn -B package

# Frontend
Set-Location ..\frontend
npm ci
npm run dev
```

Before starting the backend, set `JWT_SECRET`, `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`, and
`APP_CORS_ALLOWED_ORIGINS`. The backend intentionally has no fallback JWT signing secret.

## Validation

```powershell
# Frontend
Set-Location .\frontend
npm ci
npm run typecheck
npm run lint
npm run test
npm run build

# Backend
Set-Location ..\backend
mvn -B test

# AI service
Set-Location ..\ai-service
.\.venv\Scripts\python.exe -m pytest -q

# Full API smoke flow, with all services running
Set-Location ..
py -3.12 .\scripts\smoke_test.py http://localhost:8082
```

The Playwright test requires PostgreSQL, the AI service, the backend, and the frontend to be running:

```powershell
Set-Location .\frontend
npx playwright install chromium
$env:E2E_BASE_URL = "http://localhost:5173"
npx playwright test
```

## Security baseline

- BCrypt password hashing
- Stateless, signed JWT sessions in HttpOnly cookies
- CSRF cookie/header protection for state-changing requests
- Explicit credentialed CORS origins
- User-scoped repository queries for private data
- PDF size, content-type, and magic-byte validation
- Request body, concurrency, timeout, and rate limits
- Internal API-key authentication between backend and AI service
- Production startup validation for JWT secrets, CORS, cookies, and remote AI-service TLS