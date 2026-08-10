-- DropIndex
DROP INDEX `Message_platformMessageId_idx` ON `Message`;

-- AlterTable
ALTER TABLE `AnalysisResult` ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `confidence` DOUBLE NULL,
    ADD COLUMN `deterministicScore` INTEGER NULL,
    ADD COLUMN `failureCode` VARCHAR(191) NULL,
    ADD COLUMN `jobId` VARCHAR(191) NULL,
    ADD COLUMN `limitations` JSON NULL,
    ADD COLUMN `modelVersion` VARCHAR(191) NULL,
    ADD COLUMN `providerResults` JSON NULL,
    ADD COLUMN `ruleVersion` VARCHAR(191) NULL,
    ADD COLUMN `safeNextSteps` JSON NULL;

-- AlterTable
ALTER TABLE `IncidentReport` ADD COLUMN `autoReason` TEXT NULL,
    ADD COLUMN `origin` ENUM('USER', 'AUTO') NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE `User` ADD COLUMN `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE `AnalysisJob` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `errorDetails` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AnalysisJob_idempotencyKey_key`(`idempotencyKey`),
    INDEX `AnalysisJob_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UrlCheck` (
    `id` VARCHAR(191) NOT NULL,
    `analysisResultId` VARCHAR(191) NOT NULL,
    `urlHash` CHAR(64) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CHECKED',
    `verdict` VARCHAR(191) NULL,
    `score` DOUBLE NULL,
    `reason` TEXT NULL,
    `metadata` JSON NULL,
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UrlCheck_analysisResultId_idx`(`analysisResultId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageIndicator` (
    `id` VARCHAR(191) NOT NULL,
    `analysisResultId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,

    INDEX `MessageIndicator_analysisResultId_idx`(`analysisResultId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncidentAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `incidentReportId` VARCHAR(191) NOT NULL,
    `officerId` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assignedBy` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `IncidentAssignment_incidentReportId_key`(`incidentReportId`),
    INDEX `IncidentAssignment_officerId_idx`(`officerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorType` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NULL,
    `targetId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ipHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_actorId_action_idx`(`actorId`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `officerId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `readAt` DATETIME(3) NULL,
    `deliveryStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_officerId_readAt_idx`(`officerId`, `readAt`),
    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `device` VARCHAR(191) NULL,
    `ipHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserSession_tokenHash_key`(`tokenHash`),
    INDEX `UserSession_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OfficerSession` (
    `id` VARCHAR(191) NOT NULL,
    `officerId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `device` VARCHAR(191) NULL,
    `ipHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OfficerSession_tokenHash_key`(`tokenHash`),
    INDEX `OfficerSession_officerId_expiresAt_idx`(`officerId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `officerId` VARCHAR(191) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MfaChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `officerId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MfaChallenge_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `AnalysisResult_jobId_key` ON `AnalysisResult`(`jobId`);

-- AddForeignKey
ALTER TABLE `AnalysisJob` ADD CONSTRAINT `AnalysisJob_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisResult` ADD CONSTRAINT `AnalysisResult_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `AnalysisJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UrlCheck` ADD CONSTRAINT `UrlCheck_analysisResultId_fkey` FOREIGN KEY (`analysisResultId`) REFERENCES `AnalysisResult`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageIndicator` ADD CONSTRAINT `MessageIndicator_analysisResultId_fkey` FOREIGN KEY (`analysisResultId`) REFERENCES `AnalysisResult`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentAssignment` ADD CONSTRAINT `IncidentAssignment_incidentReportId_fkey` FOREIGN KEY (`incidentReportId`) REFERENCES `IncidentReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentAssignment` ADD CONSTRAINT `IncidentAssignment_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OfficerSession` ADD CONSTRAINT `OfficerSession_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MfaChallenge` ADD CONSTRAINT `MfaChallenge_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `Officer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

