# GymOS Backend — FastAPI + PostgreSQL

Enterprise Gym Management System backend following **Clean Architecture** and **SOLID** principles.

---

## Architecture Overview

```
gymos-backend/
├── app/
│   ├── api/                        # API Layer (HTTP concerns only)
│   │   ├── deps.py                 # JWT auth, RBAC, pagination dependencies
│   │   └── v1/
│   │       ├── router.py           # Route aggregation
│   │       └── endpoints/
│   │           ├── auth.py         # Login, refresh, logout, me
│   │           ├── gym.py          # Members, Trainers, Staff, Exercises, Tiers
│   │           ├── finance.py      # Billing, Expenses, Salaries, Reports, Dashboard
│   │           └── config.py       # Dynamic app/module/KPI/chart config
│   │
│   ├── application/                # Application Layer (use cases)
│   │   ├── schemas/                # Pydantic v2 request/response models
│   │   └── services/
│   │       ├── billing_engine.py   # Invoice calculation + persistence
│   │       ├── month_close.py      # Period-end accounting engine
│   │       └── code_generator.py   # Human-readable ID sequences
│   │
│   ├── domain/                     # Domain Layer (pure business rules)
│   │   ├── enums.py                # All typed enumerations
│   │   └── models/                 # SQLAlchemy ORM entities
│   │       ├── base.py             # BaseModel (UUID PK, timestamps, soft-delete, JSONB)
│   │       ├── user.py             # User, RefreshToken, AuditLog
│   │       ├── gym.py              # Member, Trainer, Staff, Exercise, MembershipTier
│   │       ├── billing.py          # BillingInvoice, LineItem, DiscountOption, BillingRuleConfig
│   │       ├── finance.py          # Expense, SalaryRecords, MonthlyClose
│   │       └── app_config.py       # AppSetting, ModuleConfig, KpiConfig, ChartConfig
│   │
│   ├── infrastructure/             # Infrastructure Layer (DB access)
│   │   ├── database.py             # Async engine + session factory
│   │   └── repositories/
│   │       ├── base.py             # Generic async CRUD repository
│   │       └── gym.py              # Domain-specific repositories
│   │
│   ├── core/                       # Cross-cutting
│   │   ├── config.py               # Settings from env (pydantic-settings)
│   │   └── security.py             # JWT + bcrypt
│   │
│   └── main.py                     # FastAPI app factory
│
├── alembic/                        # Database migrations
│   ├── env.py                      # Async migration runner
│   └── versions/                   # Auto-generated migration files
│
├── scripts/
│   └── seed.py                     # Idempotent DB seeder
│
├── schema.sql                      # Reference SQL schema
├── requirements.txt
├── alembic.ini
└── .env.example
```

---

## Quick Start

### 1. Prerequisites

- Python 3.11+
- PostgreSQL 15+
- (Optional) Docker for containerised Postgres

### 2. Clone & Install

```bash
git clone <repo>
cd gymos-backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Create PostgreSQL Database

```sql
-- Run as postgres superuser
CREATE USER gymos_user WITH PASSWORD 'strongpassword';
CREATE DATABASE gymos_db OWNER gymos_user;
GRANT ALL PRIVILEGES ON DATABASE gymos_db TO gymos_user;
```

Or with Docker:
```bash
docker run -d \
  --name gymos-pg \
  -e POSTGRES_USER=gymos_user \
  -e POSTGRES_PASSWORD=strongpassword \
  -e POSTGRES_DB=gymos_db \
  -p 5432:5432 \
  postgres:15-alpine
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, DATABASE_URL_SYNC, JWT_SECRET_KEY
```

**Generate a secure JWT secret:**
```bash
python -c "import secrets; print(secrets.token_hex(64))"
```

### 5. Run Migrations

```bash
# Generate first migration from models
alembic revision --autogenerate -m "initial_schema"

# Apply migrations
alembic upgrade head
```

### 6. Seed Initial Data

```bash
python scripts/seed.py
```

This seeds:
- ✅ Admin user: `admin@gymos.io` / `GymOS@Admin2025!`
- ✅ Membership tiers (Basic, Pro, Elite) with fees in DB
- ✅ Billing rules (tax_rate=0.08, late_fee=15, trainer_multiplier=1.0)
- ✅ 6 discount options
- ✅ App settings, module config, KPI config, chart config

### 7. Start the Server

```bash
# Development (with auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 8. API Docs

- Swagger UI:  http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc
- Health:      http://localhost:8000/health

---

## API Reference

### Base URL: `/api/v1`

| Endpoint | Method | Description |
|---|---|---|
| `/auth/login` | POST | Get access + refresh tokens |
| `/auth/refresh` | POST | Rotate refresh token |
| `/auth/logout` | POST | Revoke refresh token |
| `/auth/me` | GET | Current user profile |
| `/config/app` | GET | App settings (name, logo, colors) |
| `/config/modules` | GET | Navigation modules (role-filtered) |
| `/config/kpis` | GET | KPI card definitions |
| `/config/charts` | GET | Chart panel definitions |
| `/tiers` | GET/POST/PUT | Membership tier CRUD |
| `/members` | GET/POST | List / create members |
| `/members/{id}` | GET/PUT/DELETE | Member operations |
| `/trainers` | GET/POST | List / create trainers |
| `/trainers/active` | GET | Active trainers only (for billing) |
| `/staff` | GET/POST/PUT/DELETE | Staff CRUD |
| `/exercises` | GET/POST/PUT/DELETE | Exercise catalog CRUD |
| `/exercises/active` | GET | Active exercises (for billing) |
| `/billing/rules` | GET | All billing rule configs |
| `/billing/rules/{key}` | PUT | Update a billing rule |
| `/billing/discounts` | GET/POST/DELETE | Discount option management |
| `/billing/invoices/preview` | POST | Compute invoice without saving |
| `/billing/invoices` | GET/POST | List / create invoices |
| `/billing/invoices/{id}` | GET | Invoice with line items |
| `/billing/invoices/{id}/mark-paid` | PUT | Mark invoice as paid |
| `/expenses` | GET/POST/PUT/DELETE | Expense CRUD |
| `/salaries/summary?billing_month=YYYY-MM` | GET | Staff + trainer salary summary |
| `/reports/monthly?months=6` | GET | Monthly P&L from closed periods |
| `/dashboard/stats` | GET | KPI data + charts + recent members |
| `/month-close/preview?billing_month=YYYY-MM` | GET | Preview close totals |
| `/month-close` | GET/POST | List closes / execute close |
| `/month-close/{month}/reopen` | POST | Reopen closed period (admin) |

---

## Role-Based Access Control

| Role | Can Access |
|---|---|
| `admin` | All endpoints, all operations |
| `manager` | Most endpoints; cannot delete, cannot reopen month |
| `staff` | Members, billing, exercises |
| `trainer` | Dashboard, members (read), exercises (read) |
| `member` | Dashboard, own billing only |

Permissions are enforced via `require_roles()` dependency at the route level.

---

## Business Logic Rules

### Billing Formula (in `BillingEngine`)

```
subtotal       = membership_fee + sum(exercise_fees) + trainer_fee
                 where trainer_fee = hourly_rate × sessions × trainer_multiplier

total_discount = sum of applied discount amounts
                 (percentage → subtotal × rate; flat → min(value, subtotal))

taxable        = max(0, subtotal - total_discount)
tax            = taxable × tax_rate              ← read from billing_rule_configs
total_due      = taxable + tax
```

All rate values (`tax_rate`, `trainer_multiplier`, `late_fee`) are rows in `billing_rule_configs` — change them via the `/billing/rules` API. **Nothing is hardcoded.**

### Month Close

1. `GET /month-close/preview` — see totals before committing
2. `POST /month-close` — locks the month; no new invoices or expense mutations allowed
3. `POST /month-close/{month}/reopen` — admin only; re-opens for corrections

---

## Adding a New Module (e.g. Diet Plans)

1. **Backend**: Create model in `app/domain/models/`, add schema/repository, register endpoint in `app/api/v1/router.py`
2. **Database**: Insert a row in `module_configs` with the new `module_id`
3. **Frontend**: Zero changes — the sidebar and routing rebuild automatically from the API

---

## Schema Evolution

- Add nullable columns → create a migration (`alembic revision --autogenerate`)
- Add new fields to existing records → use `extra_data JSONB` without a migration
- Rename a status value → add the new enum value, migrate data, remove old value (3-step migration)

---

## Migration Commands

```bash
# Create new migration after model changes
alembic revision --autogenerate -m "add_diet_plans_module"

# Apply all pending migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1

# Show current revision
alembic current

# Show migration history
alembic history --verbose
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Async PostgreSQL URL (`postgresql+asyncpg://...`) |
| `DATABASE_URL_SYNC` | ✅ | — | Sync URL for Alembic (`postgresql+psycopg2://...`) |
| `JWT_SECRET_KEY` | ✅ | — | 64-byte hex string |
| `JWT_ALGORITHM` | | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | | `30` | Access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | | `7` | Refresh token TTL |
| `ALLOWED_ORIGINS` | | `*` | Comma-separated CORS origins |
| `DEBUG` | | `false` | Enable SQL echo + docs in production |
| `ENVIRONMENT` | | `development` | `development\|staging\|production` |
| `DEFAULT_TAX_RATE` | | `0.08` | Seeder default (overridden in DB) |

---

## Testing

```bash
# Install test deps
pip install pytest pytest-asyncio httpx

# Run all tests
pytest -v

# Run with coverage
pytest --cov=app --cov-report=html
```

---

## Production Deployment Checklist

- [ ] `ENVIRONMENT=production` (disables /docs, /redoc)
- [ ] Strong `JWT_SECRET_KEY` (64+ random bytes)
- [ ] `ALLOWED_ORIGINS` restricted to your frontend domain
- [ ] `ALLOWED_HOSTS` set to your server hostname
- [ ] `DEBUG=false`
- [ ] PostgreSQL connection pooling (PgBouncer recommended)
- [ ] Run behind reverse proxy (nginx / Caddy)
- [ ] Set up log aggregation (structlog → JSON → ELK/Loki)
- [ ] Monitor with Sentry or similar
