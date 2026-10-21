-- CareerLens AI - initial schema
-- Ownership: every private row is reachable from users.id; deleting a user cascades.

CREATE TABLE users (
    id              UUID PRIMARY KEY,
    email           VARCHAR(254) NOT NULL,
    password_hash   VARCHAR(100) NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    headline        VARCHAR(150),
    token_version   INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email))
);

-- Resume text is stored so it can be reviewed, edited and re-analysed.
-- Uploaded PDF files themselves are never stored (processed in memory only).
CREATE TABLE resumes (
    id                UUID PRIMARY KEY,
    user_id           UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title             VARCHAR(120) NOT NULL,
    source_type       VARCHAR(10)  NOT NULL,
    original_filename VARCHAR(255),
    page_count        INTEGER,
    content_text      TEXT         NOT NULL,
    char_count        INTEGER      NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_resumes_source CHECK (source_type IN ('PDF', 'TEXT')),
    CONSTRAINT ck_resumes_char_count CHECK (char_count >= 0)
);
CREATE INDEX ix_resumes_user_updated ON resumes (user_id, updated_at DESC);

CREATE TABLE comparisons (
    id                 UUID PRIMARY KEY,
    user_id            UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    resume_id          UUID          REFERENCES resumes (id) ON DELETE SET NULL,
    resume_title       VARCHAR(120),
    name               VARCHAR(150)  NOT NULL,
    job_title          VARCHAR(150),
    company            VARCHAR(150),
    job_description    TEXT          NOT NULL,
    saved              BOOLEAN       NOT NULL DEFAULT FALSE,
    overall_score      NUMERIC(5, 1) NOT NULL,
    required_score     NUMERIC(5, 1),
    preferred_score    NUMERIC(5, 1),
    semantic_score     NUMERIC(5, 1),
    project_score      NUMERIC(5, 1),
    experience_score   NUMERIC(5, 1),
    evidence_score     NUMERIC(5, 1),
    score_band         VARCHAR(10)   NOT NULL,
    scoring_version    VARCHAR(20)   NOT NULL,
    analysis_version   VARCHAR(20)   NOT NULL,
    taxonomy_version   VARCHAR(20)   NOT NULL,
    model_name         VARCHAR(120)  NOT NULL,
    input_fingerprint  VARCHAR(64)    NOT NULL,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    saved_at           TIMESTAMPTZ,
    CONSTRAINT ck_comparisons_score CHECK (overall_score BETWEEN 0 AND 100),
    CONSTRAINT ck_comparisons_band CHECK (score_band IN ('strong', 'good', 'partial', 'limited'))
);
CREATE INDEX ix_comparisons_user_saved_created ON comparisons (user_id, saved, created_at DESC);
CREATE INDEX ix_comparisons_user_score ON comparisons (user_id, overall_score);
CREATE INDEX ix_comparisons_resume ON comparisons (resume_id);
CREATE INDEX ix_comparisons_draft_cleanup ON comparisons (created_at) WHERE saved = FALSE;

-- Full explainable result, kept separate so list queries never load large JSON documents.
CREATE TABLE analysis_results (
    comparison_id  UUID PRIMARY KEY REFERENCES comparisons (id) ON DELETE CASCADE,
    result_json    JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalised per-requirement outcomes used for analytics (frequently missing skills, etc.).
CREATE TABLE comparison_skills (
    id             BIGSERIAL PRIMARY KEY,
    comparison_id  UUID        NOT NULL REFERENCES comparisons (id) ON DELETE CASCADE,
    skill_name     VARCHAR(80) NOT NULL,
    category       VARCHAR(30) NOT NULL,
    importance     VARCHAR(10) NOT NULL,
    status         VARCHAR(10) NOT NULL,
    CONSTRAINT uq_comparison_skill UNIQUE (comparison_id, skill_name),
    CONSTRAINT ck_comparison_skills_importance CHECK (importance IN ('REQUIRED', 'PREFERRED')),
    CONSTRAINT ck_comparison_skills_status CHECK (status IN ('MATCHED', 'PARTIAL', 'MISSING', 'REVIEW'))
);
CREATE INDEX ix_comparison_skills_status_skill ON comparison_skills (status, skill_name);
