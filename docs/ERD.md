# Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Order : creates
    User ||--o{ PlanningRun : runs
    User ||--o{ AuditLog : writes
    User ||--o{ PdfExport : exports

    Factory ||--o{ FieldTemplate : "optional link"

    Order ||--o{ OrderField : has
    Order ||--o{ OrderMatrixCell : has
    Order ||--o{ OrderPhoto : has
    Order ||--o{ PlanningRun : has
    Order ||--o{ PdfExport : has
    Order ||--o{ ActualPerformance : has
    Order ||--o| Scenario : "selectedScenario"

    PlanningRun ||--o{ Scenario : generates

    Scenario ||--o{ RouteStep : contains
    RouteStep ||--o{ RouteSplit : splits
    RouteStep ||--o{ ActualPerformance : tracks

    FieldTemplate ||--o{ FieldTemplateItem : contains

    User {
        uuid id PK
        string email UK
        string passwordHash
        string name
        UserRole role
        datetime createdAt
        datetime updatedAt
    }

    Factory {
        uuid id PK
        string name
        decimal processingDays
        decimal costPerUnit
        decimal fixedCost
        decimal confidencePct
        boolean isActive
        boolean isSplittable
        decimal minSplitPct
        int maxSplits
        int capacityPerDay
        string categories
        string notes
    }

    PrintingPlace {
        uuid id PK
        string name
        decimal processingDays
        decimal costPerUnit
        string printTypes
    }

    FabricSupplier {
        uuid id PK
        string name
        decimal processingDays
        int moq
    }

    GlobalSettings {
        string id PK
        string companyName
        string currency
        decimal defaultConfidence
        int transportBufferDays
        int maxVendorsPerStep
        string workingDaysJson
        string holidaysJson
    }

    Order {
        uuid id PK
        string orderNo UK
        OrderStatus status
        datetime deadline
        int totalQty
        string notes
        uuid selectedScenarioId FK
        uuid createdById FK
        string colors
        string sizes
    }

    OrderField {
        uuid id PK
        uuid orderId FK
        string label
        string value
        FieldType fieldType
        int sortOrder
        boolean isRequired
        string options
    }

    OrderMatrixCell {
        uuid id PK
        uuid orderId FK
        string color
        string size
        int quantity
    }

    OrderPhoto {
        uuid id PK
        uuid orderId FK
        string filename
        string path
        int sortOrder
    }

    PlanningRun {
        uuid id PK
        uuid orderId FK
        uuid runById FK
        datetime deadline
        int quantity
        string customWeights
        string constraintsJson
    }

    Scenario {
        uuid id PK
        uuid planningRunId FK
        ScenarioType type
        int totalDays
        decimal totalCost
        decimal certaintyPct
        int p50Days
        int p90Days
        boolean meetsDeadline
        int splitCount
        decimal deadlineRiskPct
        string vendorSummary
    }

    RouteStep {
        uuid id PK
        uuid scenarioId FK
        int stepOrder
        StepType stepType
        VendorType vendorType
        string vendorId
        string vendorName
        datetime startDate
        datetime endDate
        int days
        decimal cost
        decimal confidencePct
        int parallelGroup
    }

    RouteSplit {
        uuid id PK
        uuid routeStepId FK
        string vendorId
        string vendorName
        decimal splitPct
        int quantity
        int days
        decimal cost
    }

    ActualPerformance {
        uuid id PK
        uuid orderId FK
        uuid routeStepId FK
        StepType stepType
        VendorType vendorType
        string vendorId
        string vendorName
        int plannedDays
        int actualDays
        decimal plannedCost
        decimal actualCost
    }

    VendorStatistics {
        uuid id PK
        VendorType vendorType
        string vendorId
        int sampleCount
        decimal meanDays
        decimal stdDays
        decimal meanCost
        decimal stdCost
    }

    FieldTemplate {
        uuid id PK
        string name
        uuid factoryId FK
    }

    FieldTemplateItem {
        uuid id PK
        uuid templateId FK
        string label
        FieldType fieldType
        int sortOrder
        boolean isRequired
        string options
    }

    PdfExport {
        uuid id PK
        uuid orderId FK
        uuid exportedBy FK
        string filename
        string orient
        boolean inclPhotos
        string filePath
        int version
    }

    AuditLog {
        uuid id PK
        uuid userId FK
        string action
        string entityType
        string entityId
        string details
    }
```

## Enums

- **UserRole**: ADMIN, PLANNER, PRODUCTION_MANAGER, VIEWER
- **OrderStatus**: DRAFT → PLANNED → RELEASED → IN_PRODUCTION → COMPLETED → ARCHIVED
- **ScenarioType**: FASTEST_TIME, LOWEST_COST, BALANCED, MOST_RELIABLE, CUSTOM
- **StepType**: FABRIC, PRINT, FACTORY
- **VendorType**: FACTORY, PRINTING_PLACE, FABRIC_SUPPLIER
- **FieldType**: TEXT, DATE, NUMBER, TEXTAREA, DROPDOWN
