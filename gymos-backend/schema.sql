-- ═══════════════════════════════════════════════════════════════
--  GymOS — Production Database Schema (PostgreSQL 15+)
--  Generated for reference — run Alembic migrations in production.
--  All tables: UUID PKs, timestamps, soft delete, JSONB extra_data.
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram indexes for ILIKE search

-- ── Enums ────────────────────────────────────────────────────────
CREATE TYPE user_role_enum       AS ENUM ('admin','manager','staff','trainer','member');
CREATE TYPE record_status_enum   AS ENUM ('active','inactive','archived');
CREATE TYPE trainer_spec_enum    AS ENUM ('Strength','Cardio','Yoga','CrossFit','Boxing','Swimming');
CREATE TYPE staff_role_enum      AS ENUM ('Receptionist','Cleaner','Security','Manager');
CREATE TYPE exercise_category_enum AS ENUM ('Cardio','Strength','Flexibility','Balance','HIIT');
CREATE TYPE difficulty_level_enum  AS ENUM ('Easy','Medium','Hard');
CREATE TYPE expense_category_enum  AS ENUM ('Utilities','Equipment','Maintenance','Marketing','Supplies');
CREATE TYPE discount_type_enum     AS ENUM ('percentage','flat');
CREATE TYPE invoice_status_enum    AS ENUM ('draft','issued','paid','overdue','void');
CREATE TYPE month_close_status_enum AS ENUM ('open','closed');

-- ════════════════════════════════════════════════════════════
--  AUTH
-- ════════════════════════════════════════════════════════════

CREATE TABLE users (
    id               VARCHAR(36)       PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email            VARCHAR(255)      NOT NULL UNIQUE,
    hashed_password  VARCHAR(255)      NOT NULL,
    full_name        VARCHAR(255)      NOT NULL,
    role             user_role_enum    NOT NULL,
    is_active        BOOLEAN           NOT NULL DEFAULT TRUE,
    is_superuser     BOOLEAN           NOT NULL DEFAULT FALSE,
    profile_id       VARCHAR(36),
    extra_data       JSONB,
    is_deleted       BOOLEAN           NOT NULL DEFAULT FALSE,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email  ON users (email);
CREATE INDEX idx_users_role   ON users (role);

CREATE TABLE refresh_tokens (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id      VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(256) NOT NULL UNIQUE,
    is_revoked   BOOLEAN      NOT NULL DEFAULT FALSE,
    extra_data   JSONB,
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE audit_logs (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id      VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(50)  NOT NULL,
    table_name   VARCHAR(100) NOT NULL,
    record_id    VARCHAR(36),
    before_data  JSONB,
    after_data   JSONB,
    ip_address   VARCHAR(45),
    extra_data   JSONB,
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_user      ON audit_logs (user_id);
CREATE INDEX idx_audit_table     ON audit_logs (table_name);
CREATE INDEX idx_audit_record    ON audit_logs (record_id);
CREATE INDEX idx_audit_created   ON audit_logs (created_at DESC);

-- ════════════════════════════════════════════════════════════
--  APP CONFIG
-- ════════════════════════════════════════════════════════════

CREATE TABLE app_settings (
    id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    setting_key   VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    value_type    VARCHAR(20)  NOT NULL DEFAULT 'string',
    description   TEXT,
    is_public     BOOLEAN      NOT NULL DEFAULT FALSE,
    extra_data    JSONB,
    is_deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE module_configs (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    module_id    VARCHAR(50)  NOT NULL UNIQUE,
    label        VARCHAR(100) NOT NULL,
    icon         VARCHAR(10),
    section      VARCHAR(50)  NOT NULL,
    page_type    VARCHAR(50)  NOT NULL,
    data_key     VARCHAR(50),
    schema_key   VARCHAR(50),
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    allowed_roles JSONB,          -- NULL = all roles; array = role whitelist
    extra_data   JSONB,
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE kpi_configs (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    kpi_id       VARCHAR(50)  NOT NULL UNIQUE,
    label        VARCHAR(100) NOT NULL,
    icon         VARCHAR(10),
    color        VARCHAR(20),
    data_source  VARCHAR(100) NOT NULL,
    value_key    VARCHAR(50)  NOT NULL,
    format       VARCHAR(30)  NOT NULL DEFAULT 'number',
    sub_template VARCHAR(255),
    change_key   VARCHAR(50),
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    extra_data   JSONB,
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE chart_configs (
    id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    chart_id    VARCHAR(50)  NOT NULL UNIQUE,
    title       VARCHAR(150) NOT NULL,
    subtitle    VARCHAR(255),
    chart_type  VARCHAR(30)  NOT NULL,
    data_source VARCHAR(100) NOT NULL,
    config_json JSONB,
    grid_col    VARCHAR(5)   NOT NULL DEFAULT '1',
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    extra_data  JSONB,
    is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
--  GYM DOMAIN
-- ════════════════════════════════════════════════════════════

CREATE TABLE membership_tiers (
    id           VARCHAR(36)      PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tier_id      VARCHAR(50)      NOT NULL UNIQUE,
    name         VARCHAR(100)     NOT NULL,
    monthly_fee  NUMERIC(10,2)    NOT NULL,
    color        VARCHAR(20),
    badge        VARCHAR(50),
    sort_order   INTEGER          NOT NULL DEFAULT 0,
    extra_data   JSONB,           -- {"features": [...], "is_popular": true}
    is_deleted   BOOLEAN          NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE TABLE members (
    id                   VARCHAR(36)        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    member_code          VARCHAR(20)        NOT NULL UNIQUE,
    full_name            VARCHAR(255)       NOT NULL,
    email                VARCHAR(255)       NOT NULL UNIQUE,
    phone                VARCHAR(30),
    join_date            DATE               NOT NULL,
    status               record_status_enum NOT NULL DEFAULT 'active',
    balance              NUMERIC(12,2)      NOT NULL DEFAULT 0.00,
    membership_tier_id   VARCHAR(36)        REFERENCES membership_tiers(id) ON DELETE SET NULL,
    user_id              VARCHAR(36)        REFERENCES users(id) ON DELETE SET NULL,
    extra_data           JSONB,
    is_deleted           BOOLEAN            NOT NULL DEFAULT FALSE,
    deleted_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_members_email   ON members (email);
CREATE INDEX idx_members_status  ON members (status);
CREATE INDEX idx_members_tier    ON members (membership_tier_id);
CREATE INDEX idx_members_name_trgm ON members USING gin (full_name gin_trgm_ops);

CREATE TABLE trainers (
    id               VARCHAR(36)           PRIMARY KEY DEFAULT gen_random_uuid()::text,
    trainer_code     VARCHAR(20)           NOT NULL UNIQUE,
    full_name        VARCHAR(255)          NOT NULL,
    email            VARCHAR(255)          NOT NULL UNIQUE,
    specialization   trainer_spec_enum     NOT NULL,
    hourly_rate      NUMERIC(8,2)          NOT NULL,
    client_count     INTEGER               NOT NULL DEFAULT 0,
    rating           NUMERIC(3,1)          NOT NULL DEFAULT 5.0,
    status           record_status_enum    NOT NULL DEFAULT 'active',
    user_id          VARCHAR(36)           REFERENCES users(id) ON DELETE SET NULL,
    extra_data       JSONB,
    is_deleted       BOOLEAN               NOT NULL DEFAULT FALSE,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trainers_status ON trainers (status);

CREATE TABLE staff (
    id               VARCHAR(36)        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    staff_code       VARCHAR(20)        NOT NULL UNIQUE,
    full_name        VARCHAR(255)       NOT NULL,
    email            VARCHAR(255)       NOT NULL UNIQUE,
    role             staff_role_enum    NOT NULL,
    monthly_salary   NUMERIC(10,2)      NOT NULL,
    hire_date        DATE               NOT NULL,
    status           record_status_enum NOT NULL DEFAULT 'active',
    user_id          VARCHAR(36)        REFERENCES users(id) ON DELETE SET NULL,
    extra_data       JSONB,
    is_deleted       BOOLEAN            NOT NULL DEFAULT FALSE,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE TABLE exercises (
    id                VARCHAR(36)               PRIMARY KEY DEFAULT gen_random_uuid()::text,
    exercise_code     VARCHAR(20)               NOT NULL UNIQUE,
    name              VARCHAR(255)              NOT NULL,
    category          exercise_category_enum    NOT NULL,
    duration_minutes  INTEGER                   NOT NULL,
    price_per_session NUMERIC(8,2)              NOT NULL,
    calories_burned   INTEGER                   NOT NULL DEFAULT 0,
    difficulty        difficulty_level_enum     NOT NULL DEFAULT 'Medium',
    description       TEXT,
    status            record_status_enum        NOT NULL DEFAULT 'active',
    extra_data        JSONB,
    is_deleted        BOOLEAN                   NOT NULL DEFAULT FALSE,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_exercises_category ON exercises (category);
CREATE INDEX idx_exercises_status   ON exercises (status);

-- ════════════════════════════════════════════════════════════
--  BILLING
-- ════════════════════════════════════════════════════════════

CREATE TABLE billing_rule_configs (
    id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    rule_key     VARCHAR(100) NOT NULL UNIQUE,
    rule_value   VARCHAR(255) NOT NULL,
    label        VARCHAR(255) NOT NULL,
    description  TEXT,
    value_type   VARCHAR(20)  NOT NULL DEFAULT 'float',
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    extra_data   JSONB,
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE discount_options (
    id              VARCHAR(36)         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    discount_code   VARCHAR(50)         NOT NULL UNIQUE,
    label           VARCHAR(150)        NOT NULL,
    description     TEXT,
    discount_type   discount_type_enum  NOT NULL,
    value           NUMERIC(8,2)        NOT NULL,
    icon            VARCHAR(10),
    color           VARCHAR(20),
    requires_note   BOOLEAN             NOT NULL DEFAULT FALSE,
    is_stackable    BOOLEAN             NOT NULL DEFAULT TRUE,
    status          record_status_enum  NOT NULL DEFAULT 'active',
    sort_order      INTEGER             NOT NULL DEFAULT 0,
    extra_data      JSONB,
    is_deleted      BOOLEAN             NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_invoices (
    id                   VARCHAR(36)          PRIMARY KEY DEFAULT gen_random_uuid()::text,
    invoice_number       VARCHAR(30)          NOT NULL UNIQUE,
    member_id            VARCHAR(36)          NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    billing_month        VARCHAR(7)           NOT NULL,  -- YYYY-MM
    status               invoice_status_enum  NOT NULL DEFAULT 'draft',
    subtotal             NUMERIC(12,2)        NOT NULL DEFAULT 0.00,
    total_discount       NUMERIC(12,2)        NOT NULL DEFAULT 0.00,
    taxable_amount       NUMERIC(12,2)        NOT NULL DEFAULT 0.00,
    tax_amount           NUMERIC(12,2)        NOT NULL DEFAULT 0.00,
    total_due            NUMERIC(12,2)        NOT NULL DEFAULT 0.00,
    amount_paid          NUMERIC(12,2)        NOT NULL DEFAULT 0.00,
    tax_rate_snapshot    NUMERIC(5,4)         NOT NULL DEFAULT 0.08,
    notes                TEXT,
    extra_data           JSONB,
    is_deleted           BOOLEAN              NOT NULL DEFAULT FALSE,
    deleted_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoices_member  ON billing_invoices (member_id);
CREATE INDEX idx_invoices_month   ON billing_invoices (billing_month);
CREATE INDEX idx_invoices_status  ON billing_invoices (status);

CREATE TABLE invoice_line_items (
    id            VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    invoice_id    VARCHAR(36)  NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    description   VARCHAR(255) NOT NULL,
    line_type     VARCHAR(50)  NOT NULL,    -- membership|exercise|trainer
    reference_id  VARCHAR(36),              -- FK to exercise/trainer
    quantity      INTEGER      NOT NULL DEFAULT 1,
    unit_price    NUMERIC(10,2) NOT NULL,
    total_price   NUMERIC(10,2) NOT NULL,
    extra_data    JSONB,
    is_deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_line_items_invoice ON invoice_line_items (invoice_id);

CREATE TABLE invoice_discounts (
    id                      VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    invoice_id              VARCHAR(36)  NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    discount_option_id      VARCHAR(36)  NOT NULL REFERENCES discount_options(id) ON DELETE RESTRICT,
    discount_type_snapshot  VARCHAR(20)  NOT NULL,
    value_snapshot          NUMERIC(8,2) NOT NULL,
    discount_amount         NUMERIC(10,2) NOT NULL,
    note                    TEXT,
    extra_data              JSONB,
    is_deleted              BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_inv_discounts_invoice ON invoice_discounts (invoice_id);

-- ════════════════════════════════════════════════════════════
--  FINANCE
-- ════════════════════════════════════════════════════════════

CREATE TABLE expenses (
    id              VARCHAR(36)            PRIMARY KEY DEFAULT gen_random_uuid()::text,
    description     VARCHAR(255)           NOT NULL,
    category        expense_category_enum  NOT NULL,
    amount          NUMERIC(12,2)          NOT NULL,
    expense_date    DATE                   NOT NULL,
    vendor          VARCHAR(150),
    billing_month   VARCHAR(7)             NOT NULL,
    status          record_status_enum     NOT NULL DEFAULT 'active',
    receipt_url     VARCHAR(500),
    approved_by     VARCHAR(36)            REFERENCES users(id) ON DELETE SET NULL,
    extra_data      JSONB,
    is_deleted      BOOLEAN                NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_expenses_month    ON expenses (billing_month);
CREATE INDEX idx_expenses_category ON expenses (category);
CREATE INDEX idx_expenses_date     ON expenses (expense_date);

CREATE TABLE staff_salary_records (
    id             VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    staff_id       VARCHAR(36)  NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    billing_month  VARCHAR(7)   NOT NULL,
    base_salary    NUMERIC(10,2) NOT NULL,
    bonus          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    deduction      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    net_salary     NUMERIC(10,2) NOT NULL,
    paid           BOOLEAN      NOT NULL DEFAULT FALSE,
    notes          TEXT,
    extra_data     JSONB,
    is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (staff_id, billing_month)
);
CREATE INDEX idx_staff_salary_month ON staff_salary_records (billing_month);

CREATE TABLE trainer_salary_records (
    id                         VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    trainer_id                 VARCHAR(36)  NOT NULL REFERENCES trainers(id) ON DELETE RESTRICT,
    billing_month              VARCHAR(7)   NOT NULL,
    hourly_rate_snapshot       NUMERIC(8,2) NOT NULL,
    sessions_count             INTEGER      NOT NULL DEFAULT 0,
    trainer_multiplier_snapshot NUMERIC(5,3) NOT NULL DEFAULT 1.000,
    gross_earnings             NUMERIC(12,2) NOT NULL,
    bonus                      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    deduction                  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    net_earnings               NUMERIC(12,2) NOT NULL,
    paid                       BOOLEAN      NOT NULL DEFAULT FALSE,
    notes                      TEXT,
    extra_data                 JSONB,
    is_deleted                 BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at                 TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (trainer_id, billing_month)
);
CREATE INDEX idx_trainer_salary_month ON trainer_salary_records (billing_month);

CREATE TABLE monthly_closes (
    id                    VARCHAR(36)              PRIMARY KEY DEFAULT gen_random_uuid()::text,
    billing_month         VARCHAR(7)               NOT NULL UNIQUE,
    status                month_close_status_enum  NOT NULL DEFAULT 'open',
    closed_by             VARCHAR(36)              REFERENCES users(id) ON DELETE SET NULL,
    closed_at             DATE,
    total_revenue         NUMERIC(14,2)            NOT NULL DEFAULT 0.00,
    total_expenses        NUMERIC(14,2)            NOT NULL DEFAULT 0.00,
    total_salaries        NUMERIC(14,2)            NOT NULL DEFAULT 0.00,
    net_profit            NUMERIC(14,2)            NOT NULL DEFAULT 0.00,
    active_members_count  INTEGER                  NOT NULL DEFAULT 0,
    notes                 TEXT,
    extra_data            JSONB,
    is_deleted            BOOLEAN                  NOT NULL DEFAULT FALSE,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_closes_month ON monthly_closes (billing_month);

-- ── Auto-update updated_at trigger ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.columns
             WHERE column_name = 'updated_at'
             AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE OR REPLACE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        ', t, t);
    END LOOP;
END;
$$;
