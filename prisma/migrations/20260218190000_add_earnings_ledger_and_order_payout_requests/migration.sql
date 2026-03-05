-- CreateEnum
CREATE TYPE "EarningsLedgerState" AS ENUM ('payable', 'reserved', 'disbursed');

-- AlterTable
ALTER TABLE "PayoutRequest" ADD COLUMN "orderId" TEXT;

-- CreateTable
CREATE TABLE "EarningsLedger" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "state" "EarningsLedgerState" NOT NULL DEFAULT 'payable',
    "reservedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "pspPayoutRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarningsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EarningsLedger_orderId_key" ON "EarningsLedger"("orderId");

-- CreateIndex
CREATE INDEX "EarningsLedger_providerId_idx" ON "EarningsLedger"("providerId");

-- CreateIndex
CREATE INDEX "EarningsLedger_providerId_state_idx" ON "EarningsLedger"("providerId", "state");

-- CreateIndex
CREATE INDEX "EarningsLedger_state_createdAt_idx" ON "EarningsLedger"("state", "createdAt");

-- CreateIndex
CREATE INDEX "EarningsLedger_pspPayoutRef_idx" ON "EarningsLedger"("pspPayoutRef");

-- CreateIndex
CREATE INDEX "PayoutRequest_orderId_idx" ON "PayoutRequest"("orderId");

-- AddForeignKey
ALTER TABLE "EarningsLedger" ADD CONSTRAINT "EarningsLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarningsLedger" ADD CONSTRAINT "EarningsLedger_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
