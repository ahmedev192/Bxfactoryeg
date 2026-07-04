# Acceptance / QA Checklist

## Authentication & security

- [ ] Login with valid credentials returns JWT and user object
- [ ] Login with invalid credentials returns 401
- [ ] More than 10 login attempts in 15 minutes returns rate-limit error
- [ ] Protected routes reject requests without JWT (401)
- [ ] Disabled users and stale token versions are rejected after role/password changes
- [ ] VIEWER cannot create/edit orders; ADMIN/PLANNER/PRODUCTION_MANAGER can
- [ ] Server refuses to start in production without `JWT_SECRET`
- [ ] Production seed requires `SEED_ADMIN_EMAIL` and strong `SEED_ADMIN_PASSWORD`

## Health & infrastructure

- [ ] `GET /api/v1/health` returns `{ ok: true, db: "connected" }` when DB is up
- [ ] Health returns 503 when database is unreachable
- [ ] Upload files are not public at `/uploads`; authenticated photo/PDF routes enforce parent order ownership
- [ ] CORS allows configured `FRONTEND_URL` only
- [ ] Production uses `prisma migrate deploy`

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
- [ ] Required fields block PDF export until filled

## Planning

- [ ] Run planning generates multiple scenarios
- [ ] Generic workflow planning supports stages, parallel groups, process candidates, and quantity thresholds
- [ ] Select scenario updates order status to PLANNED and prefills fields
- [ ] Scenario graph endpoint returns linear + decision graph
- [ ] Pareto frontier computed for planning run
- [ ] Deadline risk Monte Carlo returns percentage
- [ ] Record actuals upserts by route step, captures completion date/notes, updates vendor statistics and sets order COMPLETED
- [ ] Export planning run Excel downloads Order Brief, Scenarios, RouteDetails, and Action Plan sheets

## Field templates

- [ ] List, create, get by id, update, delete templates
- [ ] Apply template replaces order fields from template items
- [ ] DELETE returns 404 for missing template

## Workflow/process library

- [ ] Create stages
- [ ] Create workflow template with sequential and parallel stage groups
- [ ] Create process resources with optimistic/most-likely/pessimistic days, cost, confidence, split flag, and quantity thresholds
- [ ] Planning tab can run using a workflow template and selected process candidates

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
- [ ] `validation.test.ts` passes
- [ ] `graph.test.ts` passes
