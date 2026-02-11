-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('fixed', 'negotiable', 'market');
-- CreateEnum
CREATE TYPE "OrderPaymentStage" AS ENUM ('deposit', 'balance');
-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('pending', 'paid', 'cancelled', 'refunded');
-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('sent', 'accepted', 'rejected', 'cancelled', 'expired');
-- CreateEnum
CREATE TYPE "ReleaseRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "OrderEventType" ADD VALUE 'progress_reported';
ALTER TYPE "OrderEventType" ADD VALUE 'balance_requested';
ALTER TYPE "OrderEventType" ADD VALUE 'release_requested';
ALTER TYPE "OrderEventType" ADD VALUE 'release_approved';
ALTER TYPE "OrderEventType" ADD VALUE 'release_rejected';
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "amountPaidNet" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "amountReleasedNet" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "balanceAmount" DECIMAL(12,2),
ADD COLUMN     "depositAmount" DECIMAL(12,2),
ADD COLUMN     "depositPercent" INTEGER,
ADD COLUMN     "quoteId" TEXT,
ALTER COLUMN "tierId" DROP NOT NULL;
-- AlterTable
ALTER TABLE "ServiceTier" ADD COLUMN     "priceMax" DECIMAL(12,2),
ADD COLUMN     "priceNote" TEXT,
ADD COLUMN     "pricingModel" "PricingModel" NOT NULL DEFAULT 'fixed';
-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tierId" TEXT,
    "providerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'sent',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "depositPercent" INTEGER NOT NULL DEFAULT 0,
    "depositAmount" DECIMAL(12,2) NOT NULL,
    "balanceAmount" DECIMAL(12,2) NOT NULL,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "OrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stage" "OrderPaymentStage" NOT NULL,
    "status" "OrderPaymentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "amountNetProvider" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "paymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "OrderProgressReport" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderProgressReport_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "OrderReleaseRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "status" "ReleaseRequestStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "OrderReleaseRequest_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Quote_threadId_idx" ON "Quote"("threadId");
-- CreateIndex
CREATE INDEX "Quote_serviceId_idx" ON "Quote"("serviceId");
-- CreateIndex
CREATE INDEX "Quote_tierId_idx" ON "Quote"("tierId");
-- CreateIndex
CREATE INDEX "Quote_providerId_idx" ON "Quote"("providerId");
-- CreateIndex
CREATE INDEX "Quote_buyerId_idx" ON "Quote"("buyerId");
-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");
-- CreateIndex
CREATE INDEX "OrderPayment_orderId_idx" ON "OrderPayment"("orderId");
-- CreateIndex
CREATE INDEX "OrderPayment_paymentIntentId_idx" ON "OrderPayment"("paymentIntentId");
-- CreateIndex
CREATE INDEX "OrderPayment_stage_idx" ON "OrderPayment"("stage");
-- CreateIndex
CREATE INDEX "OrderPayment_status_idx" ON "OrderPayment"("status");
-- CreateIndex
CREATE INDEX "OrderProgressReport_orderId_idx" ON "OrderProgressReport"("orderId");
-- CreateIndex
CREATE INDEX "OrderProgressReport_providerId_idx" ON "OrderProgressReport"("providerId");
-- CreateIndex
CREATE INDEX "OrderProgressReport_createdAt_idx" ON "OrderProgressReport"("createdAt");
-- CreateIndex
CREATE INDEX "OrderReleaseRequest_orderId_idx" ON "OrderReleaseRequest"("orderId");
-- CreateIndex
CREATE INDEX "OrderReleaseRequest_paymentId_idx" ON "OrderReleaseRequest"("paymentId");
-- CreateIndex
CREATE INDEX "OrderReleaseRequest_requestedById_idx" ON "OrderReleaseRequest"("requestedById");
-- CreateIndex
CREATE INDEX "OrderReleaseRequest_approvedById_idx" ON "OrderReleaseRequest"("approvedById");
-- CreateIndex
CREATE INDEX "OrderReleaseRequest_status_idx" ON "OrderReleaseRequest"("status");
-- CreateIndex
CREATE INDEX "OrderReleaseRequest_createdAt_idx" ON "OrderReleaseRequest"("createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "ServiceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderProgressReport" ADD CONSTRAINT "OrderProgressReport_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderProgressReport" ADD CONSTRAINT "OrderProgressReport_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderReleaseRequest" ADD CONSTRAINT "OrderReleaseRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderReleaseRequest" ADD CONSTRAINT "OrderReleaseRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "OrderPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderReleaseRequest" ADD CONSTRAINT "OrderReleaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "OrderReleaseRequest" ADD CONSTRAINT "OrderReleaseRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
