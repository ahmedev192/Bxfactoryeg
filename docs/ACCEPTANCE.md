# Acceptance / QA Checklist

## Authentication & security

- [ ] Login with valid credentials returns JWT and user object
- [ ] Login with invalid credentials returns 401
- [ ] More than 10 login attempts in 15 minutes returns rate-limit error
- [ ] Protected routes reject requests without JWT (401)
- [ ] VIEWER cannot create/edit orders; ADMIN/PLANNER/PRODUCTION_MANAGER can
- [ ] Server refuses to start in production without `JWT_SECRET`

## Health & infrastructure

- [ ] `GET /api/v1/health` returns `{ ok: true, db: "connected" }` when DB is up
- [ ] Health returns 503 when database is unreachable
- [ ] Static uploads served at `/uploads`
- [ ] CORS allows configured `FRONTEND_URL` only

## Master data

- [ ] CRUD factories, printing places, fabric suppliers
- [ ] Search filter works on vendor lists
- [ ] Duplicate factory creates copy with "(نسخة)" suffix
- [ ] Export master data downloads valid `.xlsx` with three sheets
- [ ] Import master data upserts by name; returns `{ imported, updated, errors }`

## Orders

- [ ] Create order auto-generates `orderNo` and default fields
- [ ] Update order fields, colors/sizes matrix, deadline, notes
- [ ] Status transitions follow workflow (invalid transition → 400)
- [ ] Photo upload, view, delete
- [ ] PDF export metadata and file upload/download

## Planning

- [ ] Run planning generates multiple scenarios
- [ ] Select scenario updates order status to PLANNED and prefills fields
- [ ] Scenario graph endpoint returns linear + decision graph
- [ ] Pareto frontier computed for planning run
- [ ] Deadline risk Monte Carlo returns percentage
- [ ] Record actuals updates vendor statistics and sets order COMPLETED
- [ ] Export planning run Excel downloads

## Field templates

- [ ] List, create, get by id, update, delete templates
- [ ] Apply template replaces order fields from template items
- [ ] DELETE returns 404 for missing template

## Settings

- [ ] GET settings returns defaults when none exist
- [ ] PATCH settings only updates whitelisted fields (`companyName`, `currency`, `defaultConfidence`, `transportBufferDays`, `maxVendorsPerStep`, `workingDaysJson`, `holidaysJson`)
- [ ] PATCH with no allowed fields returns 400
- [ ] Non-admin cannot PATCH settings

## Reports & dashboard

- [ ] Dashboard returns KPI counts (dueThisWeek, atRisk, byStatus, etc.)
- [ ] Vendor scorecard lists vendors with stats
- [ ] Estimate accuracy report shows planned vs actual deltas
- [ ] Audit logs visible to ADMIN only

## Frontend smoke

- [ ] Login page → dashboard
- [ ] Order list, create, detail, planning tab
- [ ] Master data pages load and save
- [ ] Arabic RTL layout renders correctly
- [ ] PDF share links (WhatsApp, mailto) generated

## Automated tests

```bash
npm run test -w backend
```

- [ ] `orderStatus.test.ts` passes
- [ ] `rbac.test.ts` passes
