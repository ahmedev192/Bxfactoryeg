# Excel Import / Export Template

Master data import expects an `.xlsx` workbook with up to three worksheets. Row 1 is the header; data starts at row 2. Rows with an empty `name` column are skipped.

Import upserts by **name** (creates if new, updates if existing).

## Sheet: `Factories`

| Column | Header | Type | Required | Notes |
|--------|--------|------|----------|-------|
| A | name | string | yes | Unique lookup key |
| B | processingDays | number | no | Default: 1 |
| C | costPerUnit | number | no | Default: 0 |
| D | fixedCost | number | no | Default: 0 |
| E | confidencePct | number | no | Default: 80 |
| F | isActive | 0/1 | no | 1 = active |
| G | isSplittable | 0/1 | no | 1 = splittable |
| H | minSplitPct | number | no | Default: 10 |
| I | maxSplits | number | no | Default: 2 |
| J | categories | string | no | Free text |
| K | capacityPerDay | number | no | Optional |
| L | notes | string | no | Free text |

## Sheet: `PrintingPlaces`

| Column | Header | Type | Required | Notes |
|--------|--------|------|----------|-------|
| A | name | string | yes | Unique lookup key |
| B | processingDays | number | no | Default: 1 |
| C | costPerUnit | number | no | Default: 0 |
| D | fixedCost | number | no | Default: 0 |
| E | confidencePct | number | no | Default: 80 |
| F | isActive | 0/1 | no | 1 = active |
| G | isSplittable | 0/1 | no | 1 = splittable |
| H | minSplitPct | number | no | Default: 10 |
| I | maxSplits | number | no | Default: 2 |
| J | printTypes | string | no | e.g. screen, digital |
| K | notes | string | no | Free text |

## Sheet: `FabricSuppliers`

| Column | Header | Type | Required | Notes |
|--------|--------|------|----------|-------|
| A | name | string | yes | Unique lookup key |
| B | processingDays | number | no | Default: 1 |
| C | costPerUnit | number | no | Default: 0 |
| D | fixedCost | number | no | Default: 0 |
| E | confidencePct | number | no | Default: 80 |
| F | isActive | 0/1 | no | 1 = active |
| G | isSplittable | 0/1 | no | 1 = splittable |
| H | minSplitPct | number | no | Default: 10 |
| I | maxSplits | number | no | Default: 2 |
| J | moq | number | no | Minimum order quantity |
| K | notes | string | no | Free text |

## API usage

**Export** (download template with current data):

```
GET /api/v1/master-data/export
Authorization: Bearer <token>
```

**Import** (base64-encoded file body):

```
POST /api/v1/master-data/import
Authorization: Bearer <token>
Content-Type: application/json

{ "fileBase64": "<base64 of .xlsx>" }
```

Response:

```json
{
  "imported": 3,
  "updated": 5,
  "errors": ["Factories row 4: ..."]
}
```

## Planning export (read-only)

`GET /api/v1/planning-runs/:runId/export` produces a separate workbook with sheets:

- **ScenarioComparison** — scenario summary metrics
- **RouteDetails** — step-by-step route per scenario
- **MasterSnapshot** — order no, quantity, deadline

This file is export-only; there is no import path for planning results.
