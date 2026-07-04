# Internal Production Operations Platform

Unified Arabic RTL web platform for production order PDF release and operations route optimization.

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS v4 + React Flow
- **Backend:** Node.js + Express + Prisma
- **Database:** MySQL 8 (production) / SQLite (local dev without Docker)

## Quick Start

### 1. Database

**Production (MySQL):** start Docker then set `DATABASE_URL=mysql://...` in `backend/.env` and change `provider` in `prisma/schema.prisma` to `mysql`.

**Local dev (SQLite, default):** no Docker required — uses `file:./dev.db`.

### 2. Install dependencies

```bash
npm install
```

### 3. Database setup

```bash
cd backend
npm run db:push
npm run db:seed
```

### 4. Run development

From project root:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000

### Default login

- **Admin:** admin@company.com / admin123
- **Planner:** planner@company.com / planner123

## Features

### Module A — Production Order PDF
- Dynamic editable fields (add/remove/reorder)
- Color × size quantity matrix
- Multi-photo upload with auto PDF layout
- Arabic RTL PDF export (jsPDF + Amiri font)
- Custom filename, portrait/landscape
- PDF export history + server storage

### Module B — Route Optimization
- Master data: factories, printing places, fabric suppliers
- 4+ scenarios: fastest, cheapest, balanced, most reliable, custom weights
- Vendor splitting, working calendar, transport buffers
- React Flow route graph visualization
- Comparison table with P50/P90 confidence
- Scenario → production PDF handoff
- Historical actuals + vendor learning
- Excel import/export

### Platform
- JWT auth + RBAC (Admin, Planner, Production Manager, Viewer)
- Dashboard with at-risk orders and vendor scorecard
- Field templates, audit logs, reports
- WhatsApp/email PDF share links

## Project Structure

```
├── frontend/     React app
├── backend/      Express API + Prisma
├── shared/       Shared TypeScript types
├── docs/         Deploy runbook, API spec, ERD, acceptance checklist
└── docker-compose.yml  MySQL 8 for production DB
```

## Documentation

- [Deployment (MySQL + VPS)](docs/DEPLOY.md)
- [MySQL migration path](docs/MYSQL.md)
- [API reference](docs/API.md)
- [ERD](docs/ERD.md)
- [Acceptance checklist](docs/ACCEPTANCE.md)
- [Excel import template](docs/EXCEL_TEMPLATE.md)

## Testing

```bash
cd backend && npm run test
```
