-- Transaction checks (casual + batch intake) and admin-managed system settings.
-- Incident reports become polymorphic: conversation XOR transaction case.
CREATE TABLE `TransactionCheck` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `txnType` ENUM('UPI', 'NEFT', 'IMPS', 'CARD', 'CASH', 'OTHER') NOT NULL DEFAULT 'UPI',
    `senderRef` VARCHAR(191) NULL,
    `receiverRef` VARCHAR(191) NULL,
    `receiverName` VARCHAR(191) NULL,
    `merchant` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `occurredAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `riskLevel` ENUM('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'UNKNOWN',
    `score` DOUBLE NULL,
    `deterministicScore` INTEGER NULL,
    `confidence` DOUBLE NULL,
    `summary` TEXT NULL,
    `evidence` JSON NULL,
    `safeNextSteps` JSON NULL,
    `limitations` JSON NULL,
    `providerResults` JSON NULL,
    `modelVersion` VARCHAR(191) NULL,
    `ruleVersion` VARCHAR(191) NULL,
    `failureCode` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `TransactionCheck_idempotencyKey_key`(`idempotencyKey`),
    INDEX `TransactionCheck_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `TransactionCheck_riskLevel_idx`(`riskLevel`),
    INDEX `TransactionCheck_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `SystemSetting_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `TransactionCheck` ADD CONSTRAINT `TransactionCheck_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `IncidentReport` ADD COLUMN `transactionCheckId` VARCHAR(191) NULL;
ALTER TABLE `IncidentReport` MODIFY `conversationId` VARCHAR(191) NULL;
ALTER TABLE `IncidentReport` ADD CONSTRAINT `IncidentReport_transactionCheckId_fkey` FOREIGN KEY (`transactionCheckId`) REFERENCES `TransactionCheck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX `IncidentReport_transactionCheckId_idx` ON `IncidentReport`(`transactionCheckId`);
