# ⬡ GymOS — Enterprise Gym Management System

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white" />
  <img src="https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white" />
</p>

<p align="center">
  A full-stack gym management platform built with <strong>FastAPI + React</strong> — handling members, attendance, billing, trainers, staff, and financial reporting in one unified dashboard.
</p>

---

## ✨ Features

### 👥 Member Management
- Add, edit, and archive gym members with full profile support (name, email, phone, CNIC)
- Auto-generated member codes (`M001`, `M002`, ...)
- Membership tier assignment (Basic, Silver, Gold, Platinum)
- Custom monthly fee per member via an interactive Fees Dialog
- Personal trainer assignment per member

### 🏆 Membership Tiers
- Four configurable tiers with dynamic fee calculation
- Fees are derived from the exercises assigned to each tier — update an exercise price and all tier fees update automatically
- Full exercise-to-tier mapping with add/remove support

### 📋 Exercise Catalog
- Manage exercises by category (Cardio, Strength, HIIT, Combat, Flexibility, CrossFit)
- Per-exercise attributes: price, duration, calories burned, status
- Toggle exercises active/archived without deleting them
- Tier-level exercise access control

### 🕐 Attendance & Biometric Integration
- **Biometric device support** via `/raw-punch` public endpoint — no auth required for the device
- Smart punch logic: first punch of the day = punch-in, every subsequent punch = punch-out (last punch wins)
- Admin manual punch-in / punch-out override
- Lookup punch-out by `attendance_id`, `member_code`, or `member_id`
- Member code normalization — device sends `1`, system stores `M001`
- Live attendance view with date filtering

### 💰 Billing System
- **Individual billing** — generate invoices per member with custom fee breakdowns
- **Month-End Bulk Billing** — generate bills for all active members in one click
- Preview before generating — see total amount before committing to DB
- Trainer fees automatically included in monthly fee
- Mark invoices paid/unpaid with toggle
- Billing history cached locally for fast navigation

### 📊 Dashboard & Reports
- **Live KPI cards** — Revenue, Active Members, Net Profit, Active Trainers
- **Revenue vs Expenses** trend chart — dynamically built from real invoices + expenses
- **Membership Mix** pie chart — live from active member tier distribution
- **Member Growth** area chart
- Financial Reports page with P&L statement, margin analysis, period filtering (Today / Week / Month / Custom)
- All data fetched from real API endpoints in parallel — no hardcoded values

### 💸 Expenses
- Log and track operational expenses with date, category, vendor, and description
- Expenses automatically pulled into profit/loss calculations on dashboard and reports

### 🏋️ Trainer & Staff Management
- Full CRUD for trainers (specialization, hourly rate, contact)
- Staff management with role and salary tracking
- Month-end salary summary with staff and trainer breakdowns

### 🔐 Authentication & Roles
- JWT-based authentication with **auto token refresh** on 401 (silent, no logout interruption)
- Role-based access control: `admin`, `manager`, `staff`, `trainer`, `member`
- Each role sees only the modules it has access to
- Live user profile in the top bar — fetched from `/auth/me`, shows name, email, and role badge
- Signup, Login, and Forgot Password flows

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI, SQLAlchemy (async), PostgreSQL, Alembic |
| **Auth** | JWT (access + refresh tokens), bcrypt |
| **Frontend** | React 18, Recharts, Plus Jakarta Sans |
| **API Client** | Axios with request/response interceptors |
| **Styling** | Inline styles with Vivid Indigo Aurora design system |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/your-username/gymos-backend.git
cd gymos-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, SECRET_KEY, etc.

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 9000
```

### Frontend Setup

```bash
cd gymos-frontend
npm install
npm run dev
```

API docs available at: `http://localhost:9000/docs`

---

## 📁 Project Structure

```
gymos-backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   └── endpoints/
│   │   │       ├── attendance.py     # Punch-in/out + biometric device
│   │   │       ├── billing.py        # Invoices + bulk billing
│   │   │       ├── members.py
│   │   │       ├── trainers.py
│   │   │       ├── staff.py
│   │   │       ├── expenses.py
│   │   │       ├── exercises.py
│   │   │       └── auth.py
│   │   └── deps.py                   # Auth dependencies
│   ├── domain/
│   │   └── models/                   # SQLAlchemy ORM models
│   ├── infrastructure/
│   │   └── database.py               # Async DB session
│   └── main.py

gymos-frontend/
├── src/
│   ├── services/
│   │   ├── api.js                    # Axios instance + interceptors
│   │   └── gymService.js             # All API call wrappers
│   └── pages/
│       └── MyComponent.jsx           # Main app (single-file React)
```

---

## 🔑 Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Login — returns access + refresh token |
| `GET` | `/api/v1/auth/me` | Get current logged-in user |
| `POST` | `/api/v1/attendance/raw-punch` | Biometric device punch (no auth) |
| `POST` | `/api/v1/attendance/punch-in` | Manual punch-in |
| `PATCH` | `/api/v1/attendance/{id}/punch-out` | Punch-out by ID or member code |
| `GET` | `/api/v1/members/` | List all members |
| `POST` | `/api/v1/billing/invoices` | Create invoice |
| `GET` | `/api/v1/dashboard/stats` | KPIs + revenue history |
| `GET` | `/api/v1/expenses/` | List expenses |

---


## 📄 License

MIT License — feel free to use, modify, and distribute.

---
