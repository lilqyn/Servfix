-- CreateEnum
CREATE TYPE "BusinessAccountStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "BusinessMemberRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "BusinessMemberStatus" AS ENUM ('active', 'invited', 'removed');

-- CreateEnum
CREATE TYPE "BusinessJobStatus" AS ENUM ('open', 'assigned', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "BusinessInvoiceStatus" AS ENUM ('draft', 'issued', 'paid', 'void');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "businessAccountId" TEXT,
ADD COLUMN     "businessInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "boostCatalog" JSONB;

-- CreateTable
CREATE TABLE "BusinessAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "BusinessAccountStatus" NOT NULL DEFAULT 'active',
    "industry" TEXT,
    "size" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMember" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BusinessMemberRole" NOT NULL DEFAULT 'member',
    "status" "BusinessMemberStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessJob" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "budget" DECIMAL(12,2),
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "status" "BusinessJobStatus" NOT NULL DEFAULT 'open',
    "requestedById" TEXT,
    "assignedProviderId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessInvoice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "status" "BusinessInvoiceStatus" NOT NULL DEFAULT 'draft',
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_slug_key" ON "BusinessAccount"("slug");

-- CreateIndex
CREATE INDEX "BusinessAccount_status_idx" ON "BusinessAccount"("status");

-- CreateIndex
CREATE INDEX "BusinessMember_accountId_idx" ON "BusinessMember"("accountId");

-- CreateIndex
CREATE INDEX "BusinessMember_userId_idx" ON "BusinessMember"("userId");

-- CreateIndex
CREATE INDEX "BusinessMember_status_idx" ON "BusinessMember"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMember_accountId_userId_key" ON "BusinessMember"("accountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessJob_orderId_key" ON "BusinessJob"("orderId");

-- CreateIndex
CREATE INDEX "BusinessJob_accountId_idx" ON "BusinessJob"("accountId");

-- CreateIndex
CREATE INDEX "BusinessJob_status_idx" ON "BusinessJob"("status");

-- CreateIndex
CREATE INDEX "BusinessJob_requestedById_idx" ON "BusinessJob"("requestedById");

-- CreateIndex
CREATE INDEX "BusinessInvoice_accountId_idx" ON "BusinessInvoice"("accountId");

-- CreateIndex
CREATE INDEX "BusinessInvoice_status_idx" ON "BusinessInvoice"("status");

-- CreateIndex
CREATE INDEX "BusinessInvoice_periodStart_idx" ON "BusinessInvoice"("periodStart");

-- CreateIndex
CREATE INDEX "Order_businessAccountId_idx" ON "Order"("businessAccountId");

-- CreateIndex
CREATE INDEX "Order_businessInvoiceId_idx" ON "Order"("businessInvoiceId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessAccountId_fkey" FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessInvoiceId_fkey" FOREIGN KEY ("businessInvoiceId") REFERENCES "BusinessInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMember" ADD CONSTRAINT "BusinessMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessJob" ADD CONSTRAINT "BusinessJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessJob" ADD CONSTRAINT "BusinessJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessJob" ADD CONSTRAINT "BusinessJob_assignedProviderId_fkey" FOREIGN KEY ("assignedProviderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessJob" ADD CONSTRAINT "BusinessJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessInvoice" ADD CONSTRAINT "BusinessInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

