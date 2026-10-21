# CareerLens AI — local development

See the root [README.md](../README.md) for the product overview and architecture. This document contains the exact
Windows and cross-platform commands used to run and validate the project locally.

## Prerequisites
- Java 21 and Maven 3.9+
- Python 3.12+ (developed on 3.13)
- Node.js 22+ (developed on 24.22.0)
- PostgreSQL 15+ (developed on 17)

## 1. Database
```sql
CREATE ROLE careerlens LOGIN PASSWORD 'careerlens_dev';   -- local-only default; override with DATABASE_PASSWORD
CREATE DATABASE careerlens OWNER careerlens;
CREATE DATABASE careerlens_test OWNER careerlens;   -- used by backend integration tests
```
Flyway creates the schema automatically on backend start (`backend/src/main/resources/db/migration`).
Local defaults: `DATABASE_URL=jdbc:postgresql://localhost:5432/careerlens`, `DATABASE_USERNAME=careerlens`,
`DATABASE_PASSWORD=careerlens_dev`. The `prod` profile has no defaults and requires all three.
Set `JWT_SECRET` to a random value of at least 32 bytes for every backend run; the application does not provide a
fallback signing secret. Analysis requests allow up to 60 seconds of CPU inference and 75 seconds for the backend
to receive the result. For slower machines, increase `AI_INFERENCE_TIMEOUT_SECONDS` first and keep
`AI_SERVICE_READ_TIMEOUT` at least 15 seconds higher.

## 2. AI service (FastAPI, port 8000)
```bash
cd ai-service
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt        # Windows: .venv\Scripts\pip install -r requirements-dev.txt
AI_MODEL_CACHE_DIR=.model-cache AI_INTERNAL_API_KEY=dev-internal-key \
  .venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```
The first start downloads the `all-MiniLM-L6-v2` embedding model (~90 MB) into `.model-cache`.
Tests: `.venv/bin/pytest`

## 3. Backend (Spring Boot, port 8082)
```bash
cd backend
mvn -B package                       # runs unit + integration tests, builds target/careerlens-backend.jar
AI_SERVICE_URL=http://127.0.0.1:8000 AI_SERVICE_API_KEY=dev-internal-key \
JWT_SECRET=local-development-secret-change-this-0123456789 \
APP_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173 \
  java -jar target/careerlens-backend.jar
```
API docs: http://localhost:8082/api/docs

### Cookie settings
| Variable | Default | Notes |
|---|---|---|
| `COOKIE_SECURE` | `false` (dev), `true` (prod) | Must be `true` when served over HTTPS. |
| `COOKIE_SAME_SITE` | `Lax` | `Strict`, `Lax` or `None`. The XSRF cookie is `Strict` unless this is `None`. |
| `COOKIE_PARTITIONED` | `false` | Adds the CHIPS `Partitioned` attribute. |

Only use `COOKIE_SAME_SITE=None` + `COOKIE_PARTITIONED=true` (+ `COOKIE_SECURE=true`) when the UI must work inside a
cross-site iframe, such as a hosted preview. The backend refuses to start if `None`/partitioned is set without `COOKIE_SECURE=true`.

## 4. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173, proxies /api to :8082
# or: npm run build && npx vite preview   (http://localhost:4173)
```
Checks:
```bash
npx tsc -p tsconfig.app.json --noEmit
npx eslint . --max-warnings 0
npx vitest run
npx playwright install chromium
E2E_BASE_URL=http://localhost:4173 npx playwright test     # needs all three services running
```

## 5. API smoke test
```bash
python scripts/smoke_test.py http://localhost:8082
```

### Windows PowerShell
From the project root:
```powershell
Set-Location .\ai-service
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:AI_MODEL_CACHE_DIR = ".model-cache"
$env:AI_INTERNAL_API_KEY = "dev-internal-key"
$env:AI_INFERENCE_TIMEOUT_SECONDS = "60"
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

In a second PowerShell window:
```powershell
Set-Location .\backend
$env:JWT_SECRET = "replace-with-a-random-secret-at-least-32-bytes"
$env:AI_SERVICE_URL = "http://127.0.0.1:8000"
$env:AI_SERVICE_API_KEY = "dev-internal-key"
$env:AI_SERVICE_READ_TIMEOUT = "75s"
$env:APP_CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:4173"
mvn -B package
java -jar target\careerlens-backend.jar
```

In a third PowerShell window:
```powershell
Set-Location .\frontend
npm ci
npm run dev
```

For the browser workflow, install the Playwright browser once, then run the test with all three services
and PostgreSQL running:
```powershell
Set-Location .\frontend
npx playwright install chromium
$env:E2E_BASE_URL = "http://localhost:5173"
npx playwright test
```

## Demo data
`demo-data/` contains a synthetic resume (TXT + PDF) and two synthetic job descriptions.
