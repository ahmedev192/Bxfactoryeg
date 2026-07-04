-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'PLANNER', 'PRODUCTION_MANAGER', 'VIEWER') NOT NULL DEFAULT 'PLANNER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `passwordChangedAt` DATETIME(3) NULL,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Factory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `processingDays` DECIMAL(10, 2) NOT NULL,
    `costPerUnit` DECIMAL(10, 2) NOT NULL,
    `fixedCost` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `confidencePct` DECIMAL(5, 2) NOT NULL DEFAULT 80,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isSplittable` BOOLEAN NOT NULL DEFAULT false,
    `minSplitPct` DECIMAL(5, 2) NOT NULL DEFAULT 10,
    `maxSplits` INTEGER NOT NULL DEFAULT 2,
    `capacityPerDay` INTEGER NULL,
    `categories` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrintingPlace` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `processingDays` DECIMAL(10, 2) NOT NULL,
    `costPerUnit` DECIMAL(10, 2) NOT NULL,
    `fixedCost` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `confidencePct` DECIMAL(5, 2) NOT NULL DEFAULT 80,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isSplittable` BOOLEAN NOT NULL DEFAULT false,
    `minSplitPct` DECIMAL(5, 2) NOT NULL DEFAULT 10,
    `maxSplits` INTEGER NOT NULL DEFAULT 2,
    `printTypes` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FabricSupplier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `processingDays` DECIMAL(10, 2) NOT NULL,
    `costPerUnit` DECIMAL(10, 2) NOT NULL,
    `fixedCost` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `confidencePct` DECIMAL(5, 2) NOT NULL DEFAULT 80,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isSplittable` BOOLEAN NOT NULL DEFAULT false,
    `minSplitPct` DECIMAL(5, 2) NOT NULL DEFAULT 10,
    `maxSplits` INTEGER NOT NULL DEFAULT 2,
    `moq` INTEGER NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GlobalSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `companyName` VARCHAR(191) NOT NULL DEFAULT '╪┤╪▒┘â╪⌐ ╪º┘ä╪Ñ┘å╪¬╪º╪¼',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EGP',
    `defaultConfidence` DECIMAL(5, 2) NOT NULL DEFAULT 80,
    `transportBufferDays` INTEGER NOT NULL DEFAULT 1,
    `maxVendorsPerStep` INTEGER NOT NULL DEFAULT 2,
    `workingDaysJson` TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
    `holidaysJson` TEXT NOT NULL DEFAULT '[]',
    `categoryPresets` TEXT NOT NULL DEFAULT '[]',
    `printTypePresets` TEXT NOT NULL DEFAULT '[]',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'PLANNED', 'RELEASED', 'IN_PRODUCTION', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `deadline` DATETIME(3) NULL,
    `totalQty` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `category` VARCHAR(191) NULL,
    `requiredPrintType` VARCHAR(191) NULL,
    `selectedScenarioId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `colors` TEXT NOT NULL DEFAULT '[]',
    `sizes` TEXT NOT NULL DEFAULT '[]',

    UNIQUE INDEX `Order_orderNo_key`(`orderNo`),
    UNIQUE INDEX `Order_selectedScenarioId_key`(`selectedScenarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderField` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL DEFAULT '',
    `fieldType` ENUM('TEXT', 'DATE', 'NUMBER', 'TEXTAREA', 'DROPDOWN') NOT NULL DEFAULT 'TEXT',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isRequired` BOOLEAN NOT NULL DEFAULT false,
    `options` TEXT NULL,

    INDEX `OrderField_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderMatrixCell` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `size` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,

    INDEX `OrderMatrixCell_orderId_idx`(`orderId`),
    UNIQUE INDEX `OrderMatrixCell_orderId_color_size_key`(`orderId`, `color`, `size`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderPhoto_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanningRun` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `runById` VARCHAR(191) NOT NULL,
    `workflowId` VARCHAR(191) NULL,
    `deadline` DATETIME(3) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `customWeights` TEXT NULL,
    `constraintsJson` TEXT NULL,
    `monteCarloTrials` INTEGER NOT NULL DEFAULT 1000,
    `maxScenarios` INTEGER NOT NULL DEFAULT 7,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlanningRun_orderId_idx`(`orderId`),
    INDEX `PlanningRun_workflowId_idx`(`workflowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Scenario` (
    `id` VARCHAR(191) NOT NULL,
    `planningRunId` VARCHAR(191) NOT NULL,
    `type` ENUM('FASTEST_TIME', 'LOWEST_COST', 'BALANCED', 'MOST_RELIABLE', 'CUSTOM') NOT NULL,
    `totalDays` INTEGER NOT NULL,
    `totalCost` DECIMAL(12, 2) NOT NULL,
    `certaintyPct` DECIMAL(5, 2) NOT NULL,
    `p5Days` INTEGER NULL,
    `p50Days` INTEGER NULL,
    `p90Days` INTEGER NULL,
    `p95Days` INTEGER NULL,
    `onTimePct` DECIMAL(5, 2) NULL,
    `isRecommended` BOOLEAN NOT NULL DEFAULT false,
    `rankLabel` VARCHAR(191) NULL,
    `meetsDeadline` BOOLEAN NOT NULL,
    `splitCount` INTEGER NOT NULL DEFAULT 0,
    `deadlineRiskPct` DECIMAL(5, 2) NULL,
    `vendorSummary` TEXT NOT NULL,

    INDEX `Scenario_planningRunId_idx`(`planningRunId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RouteStep` (
    `id` VARCHAR(191) NOT NULL,
    `scenarioId` VARCHAR(191) NOT NULL,
    `stepOrder` INTEGER NOT NULL,
    `stepType` ENUM('FABRIC', 'PRINT', 'FACTORY', 'GENERIC') NOT NULL,
    `vendorType` ENUM('FACTORY', 'PRINTING_PLACE', 'FABRIC_SUPPLIER', 'PROCESS_RESOURCE') NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `vendorName` VARCHAR(191) NOT NULL,
    `stageId` VARCHAR(191) NULL,
    `stageName` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `p95EndDate` DATETIME(3) NULL,
    `days` INTEGER NOT NULL,
    `cost` DECIMAL(12, 2) NOT NULL,
    `confidencePct` DECIMAL(5, 2) NOT NULL,
    `parallelGroup` INTEGER NULL,
    `isCritical` BOOLEAN NOT NULL DEFAULT false,

    INDEX `RouteStep_scenarioId_idx`(`scenarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RouteSplit` (
    `id` VARCHAR(191) NOT NULL,
    `routeStepId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `vendorName` VARCHAR(191) NOT NULL,
    `splitPct` DECIMAL(5, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `days` INTEGER NOT NULL,
    `cost` DECIMAL(12, 2) NOT NULL,

    INDEX `RouteSplit_routeStepId_idx`(`routeStepId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActualPerformance` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `routeStepId` VARCHAR(191) NULL,
    `stepType` ENUM('FABRIC', 'PRINT', 'FACTORY', 'GENERIC') NOT NULL,
    `vendorType` ENUM('FACTORY', 'PRINTING_PLACE', 'FABRIC_SUPPLIER', 'PROCESS_RESOURCE') NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `vendorName` VARCHAR(191) NOT NULL,
    `plannedDays` INTEGER NOT NULL,
    `actualDays` INTEGER NOT NULL,
    `plannedCost` DECIMAL(12, 2) NOT NULL,
    `actualCost` DECIMAL(12, 2) NOT NULL,
    `actualCompletionDate` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ActualPerformance_orderId_idx`(`orderId`),
    INDEX `ActualPerformance_vendorId_idx`(`vendorId`),
    UNIQUE INDEX `ActualPerformance_orderId_routeStepId_key`(`orderId`, `routeStepId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VendorStatistics` (
    `id` VARCHAR(191) NOT NULL,
    `vendorType` ENUM('FACTORY', 'PRINTING_PLACE', 'FABRIC_SUPPLIER', 'PROCESS_RESOURCE') NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `sampleCount` INTEGER NOT NULL DEFAULT 0,
    `meanDays` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `stdDays` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `meanCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `stdCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `confidencePct` DECIMAL(5, 2) NOT NULL DEFAULT 80,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VendorStatistics_vendorType_vendorId_key`(`vendorType`, `vendorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FieldTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `factoryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FieldTemplateItem` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `fieldType` ENUM('TEXT', 'DATE', 'NUMBER', 'TEXTAREA', 'DROPDOWN') NOT NULL DEFAULT 'TEXT',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isRequired` BOOLEAN NOT NULL DEFAULT false,
    `options` TEXT NULL,

    INDEX `FieldTemplateItem_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Stage` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Stage_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowStep` (
    `id` VARCHAR(191) NOT NULL,
    `workflowId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,

    INDEX `WorkflowStep_workflowId_idx`(`workflowId`),
    UNIQUE INDEX `WorkflowStep_workflowId_sortOrder_key`(`workflowId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowStepStage` (
    `id` VARCHAR(191) NOT NULL,
    `workflowStepId` VARCHAR(191) NOT NULL,
    `stageId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `WorkflowStepStage_workflowStepId_idx`(`workflowStepId`),
    INDEX `WorkflowStepStage_stageId_idx`(`stageId`),
    UNIQUE INDEX `WorkflowStepStage_workflowStepId_stageId_key`(`workflowStepId`, `stageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProcessResource` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `stageId` VARCHAR(191) NOT NULL,
    `timeOptimistic` DECIMAL(10, 2) NOT NULL,
    `timeMostLikely` DECIMAL(10, 2) NOT NULL,
    `timePessimistic` DECIMAL(10, 2) NOT NULL,
    `cost` DECIMAL(12, 2) NOT NULL,
    `costType` VARCHAR(191) NOT NULL DEFAULT 'PER_UNIT',
    `confidencePct` DECIMAL(5, 2) NOT NULL DEFAULT 80,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isSplittable` BOOLEAN NOT NULL DEFAULT false,
    `minSplitPct` DECIMAL(5, 2) NOT NULL DEFAULT 10,
    `maxSplits` INTEGER NOT NULL DEFAULT 2,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProcessResource_stageId_idx`(`stageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProcessQuantityThreshold` (
    `id` VARCHAR(191) NOT NULL,
    `processResourceId` VARCHAR(191) NOT NULL,
    `minQty` INTEGER NOT NULL,
    `addDays` DECIMAL(10, 2) NOT NULL,

    INDEX `ProcessQuantityThreshold_processResourceId_idx`(`processResourceId`),
    UNIQUE INDEX `ProcessQuantityThreshold_processResourceId_minQty_key`(`processResourceId`, `minQty`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PdfExport` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `exportedBy` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `orient` VARCHAR(191) NOT NULL DEFAULT 'p',
    `inclPhotos` BOOLEAN NOT NULL DEFAULT true,
    `filePath` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PdfExport_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_entityType_idx`(`entityType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_selectedScenarioId_fkey` FOREIGN KEY (`selectedScenarioId`) REFERENCES `Scenario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderField` ADD CONSTRAINT `OrderField_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderMatrixCell` ADD CONSTRAINT `OrderMatrixCell_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderPhoto` ADD CONSTRAINT `OrderPhoto_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanningRun` ADD CONSTRAINT `PlanningRun_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanningRun` ADD CONSTRAINT `PlanningRun_runById_fkey` FOREIGN KEY (`runById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanningRun` ADD CONSTRAINT `PlanningRun_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `WorkflowTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Scenario` ADD CONSTRAINT `Scenario_planningRunId_fkey` FOREIGN KEY (`planningRunId`) REFERENCES `PlanningRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RouteStep` ADD CONSTRAINT `RouteStep_scenarioId_fkey` FOREIGN KEY (`scenarioId`) REFERENCES `Scenario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RouteSplit` ADD CONSTRAINT `RouteSplit_routeStepId_fkey` FOREIGN KEY (`routeStepId`) REFERENCES `RouteStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActualPerformance` ADD CONSTRAINT `ActualPerformance_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActualPerformance` ADD CONSTRAINT `ActualPerformance_routeStepId_fkey` FOREIGN KEY (`routeStepId`) REFERENCES `RouteStep`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldTemplate` ADD CONSTRAINT `FieldTemplate_factoryId_fkey` FOREIGN KEY (`factoryId`) REFERENCES `Factory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldTemplateItem` ADD CONSTRAINT `FieldTemplateItem_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `FieldTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `WorkflowTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStepStage` ADD CONSTRAINT `WorkflowStepStage_workflowStepId_fkey` FOREIGN KEY (`workflowStepId`) REFERENCES `WorkflowStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStepStage` ADD CONSTRAINT `WorkflowStepStage_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `Stage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessResource` ADD CONSTRAINT `ProcessResource_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `Stage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessQuantityThreshold` ADD CONSTRAINT `ProcessQuantityThreshold_processResourceId_fkey` FOREIGN KEY (`processResourceId`) REFERENCES `ProcessResource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PdfExport` ADD CONSTRAINT `PdfExport_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PdfExport` ADD CONSTRAINT `PdfExport_exportedBy_fkey` FOREIGN KEY (`exportedBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

