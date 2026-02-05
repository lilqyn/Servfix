-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('user', 'service', 'community_post', 'community_comment', 'review', 'order');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'super_admin';
ALTER TYPE "UserRole" ADD VALUE 'moderator';
ALTER TYPE "UserRole" ADD VALUE 'support_agent';
ALTER TYPE "UserRole" ADD VALUE 'dispute_manager';
ALTER TYPE "UserRole" ADD VALUE 'operations_manager';
ALTER TYPE "UserRole" ADD VALUE 'finance_manager';
ALTER TYPE "UserRole" ADD VALUE 'marketing_manager';
ALTER TYPE "UserRole" ADD VALUE 'data_analyst';
ALTER TYPE "UserRole" ADD VALUE 'technical_admin';

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "reporterId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_targetType_idx" ON "Report"("targetType");

-- CreateIndex
CREATE INDEX "Report_targetId_idx" ON "Report"("targetId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
