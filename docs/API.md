# API Reference

Base URL: `/api/v1`

Authentication: Bearer JWT in `Authorization` header (except `/auth/login`).

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check with DB ping |

## Auth (`/auth`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/login` | — | — | Login (rate-limited: 10 / 15 min) |
| GET | `/me` | JWT | any | Current user profile |
| GET | `/users` | JWT | ADMIN | List users |
| POST | `/users` | JWT | ADMIN | Create user |

## Master data

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/factories` | JWT | VIEW+ | List factories (`?search=`) |
| POST | `/factories` | JWT | WRITE+ | Create factory |
| POST | `/factories/:id/duplicate` | JWT | WRITE+ | Duplicate factory |
| PATCH | `/factories/:id` | JWT | WRITE+ | Update factory |
| DELETE | `/factories/:id` | JWT | WRITE+ | Delete factory |
| GET | `/printing-places` | JWT | VIEW+ | List printing places |
| POST | `/printing-places` | JWT | WRITE+ | Create |
| PATCH | `/printing-places/:id` | JWT | WRITE+ | Update |
| DELETE | `/printing-places/:id` | JWT | WRITE+ | Delete |
| GET | `/fabric-suppliers` | JWT | VIEW+ | List fabric suppliers |
| POST | `/fabric-suppliers` | JWT | WRITE+ | Create |
| PATCH | `/fabric-suppliers/:id` | JWT | WRITE+ | Update |
| DELETE | `/fabric-suppliers/:id` | JWT | WRITE+ | Delete |

## Orders (`/orders`)

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/` | JWT | VIEW+ | List orders (`?search=&status=&from=&to=`) |
| POST | `/` | JWT | WRITE+ | Create order |
| GET | `/:id` | JWT | VIEW+ | Order detail |
| PATCH | `/:id` | JWT | WRITE+ | Update order fields/matrix |
| PATCH | `/:id/status` | JWT | WRITE+ | Change status (validated transitions) |
| POST | `/:id/photos` | JWT | WRITE+ | Upload photos (multipart) |
| DELETE | `/:id/photos/:photoId` | JWT | WRITE+ | Delete photo |
| GET | `/:id/photos/:photoId/file` | JWT | VIEW+ | Serve photo file |
| POST | `/:id/pdf-exports` | JWT | PDF+ | Record PDF export metadata |
| POST | `/:id/pdf-exports/upload` | JWT | PDF+ | Upload PDF file |
| GET | `/:id/pdf-exports/:exportId/download` | JWT | VIEW+ | Download PDF |

## Planning

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/orders/:orderId/planning-runs` | JWT | PLAN+ | Run planning engine |
| GET | `/orders/:orderId/planning-runs` | JWT | VIEW+ | List planning runs |
| GET | `/planning-runs/:runId/scenarios` | JWT | VIEW+ | Scenarios for a run |
| GET | `/planning-runs/:runId/pareto` | JWT | VIEW+ | Pareto frontier |
| GET | `/scenarios/:id/graph` | JWT | VIEW+ | Scenario route graph |
| POST | `/orders/:orderId/select-scenario` | JWT | WRITE+ | Select scenario for order |
| POST | `/orders/:orderId/actuals` | JWT | WRITE+ | Record actual performance |
| GET | `/orders/:orderId/actuals` | JWT | VIEW+ | List actuals |
| GET | `/orders/:orderId/deadline-risk` | JWT | VIEW+ | Monte Carlo deadline risk |

## Settings, templates, reports

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/settings` | JWT | VIEW+ | Global settings |
| PATCH | `/settings` | JWT | ADMIN | Update whitelisted settings fields |
| GET | `/field-templates` | JWT | VIEW+ | List field templates |
| POST | `/field-templates` | JWT | ADMIN | Create template |
| GET | `/field-templates/:id` | JWT | VIEW+ | Get template |
| PATCH | `/field-templates/:id` | JWT | ADMIN | Update template |
| DELETE | `/field-templates/:id` | JWT | ADMIN | Delete template |
| POST | `/orders/:orderId/apply-template/:templateId` | JWT | ADMIN | Apply template to order |
| GET | `/master-data/export` | JWT | VIEW+ | Export master data Excel |
| POST | `/master-data/import` | JWT | ADMIN | Import master data (`fileBase64`) |
| GET | `/planning-runs/:runId/export` | JWT | VIEW+ | Export planning results Excel |
| GET | `/reports/vendor-scorecard` | JWT | VIEW+ | Vendor scorecard |
| GET | `/reports/estimate-accuracy` | JWT | VIEW+ | Estimate vs actual summary |
| GET | `/dashboard` | JWT | VIEW+ | Dashboard KPIs |
| GET | `/audit-logs` | JWT | ADMIN | Audit log (`?entityType=`) |
| POST | `/pdf-exports/:exportId/share` | JWT | any | Share links (WhatsApp, mailto) |

## Role abbreviations

| Abbrev | Roles |
|--------|-------|
| VIEW+ | ADMIN, PLANNER, PRODUCTION_MANAGER, VIEWER |
| WRITE+ | ADMIN, PLANNER, PRODUCTION_MANAGER |
| PLAN+ | ADMIN, PLANNER |
| PDF+ | ADMIN, PLANNER, PRODUCTION_MANAGER |

## Error format

```json
{ "error": "message" }
```

HTTP 503 on health when DB is unreachable. HTTP 500 includes `stack` in non-production.
