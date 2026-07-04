ALTER TABLE `User`
  ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `tokenVersion` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
  ADD COLUMN `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lockedUntil` DATETIME(3) NULL;

ALTER TABLE `PlanningRun`
  ADD COLUMN `workflowId` VARCHAR(191) NULL,
  ADD COLUMN `monteCarloTrials` INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN `maxScenarios` INTEGER NOT NULL DEFAULT 7;

ALTER TABLE `Scenario`
  ADD COLUMN `p5Days` INTEGER NULL,
  ADD COLUMN `p95Days` INTEGER NULL,
  ADD COLUMN `onTimePct` DECIMAL(5, 2) NULL,
  ADD COLUMN `isRecommended` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `rankLabel` VARCHAR(191) NULL;

ALTER TABLE `RouteStep`
  MODIFY `stepType` ENUM('FABRIC', 'PRINT', 'FACTORY', 'GENERIC') NOT NULL,
  MODIFY `vendorType` ENUM('FACTORY', 'PRINTING_PLACE', 'FABRIC_SUPPLIER', 'PROCESS_RESOURCE') NOT NULL,
  ADD COLUMN `stageId` VARCHAR(191) NULL,
  ADD COLUMN `stageName` VARCHAR(191) NULL,
  ADD COLUMN `p95EndDate` DATETIME(3) NULL,
  ADD COLUMN `isCritical` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `ActualPerformance`
  MODIFY `stepType` ENUM('FABRIC', 'PRINT', 'FACTORY', 'GENERIC') NOT NULL,
  MODIFY `vendorType` ENUM('FACTORY', 'PRINTING_PLACE', 'FABRIC_SUPPLIER', 'PROCESS_RESOURCE') NOT NULL,
  ADD COLUMN `actualCompletionDate` DATETIME(3) NULL,
  ADD COLUMN `notes` TEXT NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `VendorStatistics`
  MODIFY `vendorType` ENUM('FACTORY', 'PRINTING_PLACE', 'FABRIC_SUPPLIER', 'PROCESS_RESOURCE') NOT NULL;

CREATE TABLE `Stage` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Stage_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WorkflowTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WorkflowStep` (
  `id` VARCHAR(191) NOT NULL,
  `workflowId` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL,
  INDEX `WorkflowStep_workflowId_idx`(`workflowId`),
  UNIQUE INDEX `WorkflowStep_workflowId_sortOrder_key`(`workflowId`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ProcessResource_stageId_idx`(`stageId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProcessQuantityThreshold` (
  `id` VARCHAR(191) NOT NULL,
  `processResourceId` VARCHAR(191) NOT NULL,
  `minQty` INTEGER NOT NULL,
  `addDays` DECIMAL(10, 2) NOT NULL,
  INDEX `ProcessQuantityThreshold_processResourceId_idx`(`processResourceId`),
  UNIQUE INDEX `ProcessQuantityThreshold_processResourceId_minQty_key`(`processResourceId`, `minQty`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `PlanningRun_workflowId_idx` ON `PlanningRun`(`workflowId`);
CREATE UNIQUE INDEX `ActualPerformance_orderId_routeStepId_key` ON `ActualPerformance`(`orderId`, `routeStepId`);

ALTER TABLE `PlanningRun` ADD CONSTRAINT `PlanningRun_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `WorkflowTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `WorkflowTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkflowStepStage` ADD CONSTRAINT `WorkflowStepStage_workflowStepId_fkey` FOREIGN KEY (`workflowStepId`) REFERENCES `WorkflowStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WorkflowStepStage` ADD CONSTRAINT `WorkflowStepStage_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `Stage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ProcessResource` ADD CONSTRAINT `ProcessResource_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `Stage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ProcessQuantityThreshold` ADD CONSTRAINT `ProcessQuantityThreshold_processResourceId_fkey` FOREIGN KEY (`processResourceId`) REFERENCES `ProcessResource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
