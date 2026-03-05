DO $$
BEGIN
  CREATE TYPE "OrderReleaseMethod" AS ENUM ('buyer_approved', 'auto_release', 'admin_decision');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PayoutRequestStatus" AS ENUM ('requested', 'processing', 'paid', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'delivery_submitted';
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'disbursed';

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'payment_pending';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'delivery_submitted';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'release_approved';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'disbursement_initiated';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'disbursed';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'dispute_open';

ALTER TABLE "Dispute"
ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "amountDisbursedNet" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS "deliverySubmittedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "disbursedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "disputeOpenedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "pspPaymentRef" TEXT,
ADD COLUMN IF NOT EXISTS "pspPayoutRef" TEXT,
ADD COLUMN IF NOT EXISTS "releaseApprovedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "releaseMethod" "OrderReleaseMethod",
ADD COLUMN IF NOT EXISTS "releaseVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "reviewDeadlineAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewNotifiedAt" TIMESTAMP(3);

ALTER TABLE "PayoutRequest"
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "pspTransferRef" TEXT;

UPDATE "PayoutRequest"
SET "idempotencyKey" = "id"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "PayoutRequest"
ALTER COLUMN "idempotencyKey" SET NOT NULL;

ALTER TABLE "PayoutRequest"
ADD COLUMN IF NOT EXISTS "statusNew" "PayoutRequestStatus" NOT NULL DEFAULT 'requested';

UPDATE "PayoutRequest"
SET "statusNew" = CASE LOWER(COALESCE("status", 'requested'))
  WHEN 'requested' THEN 'requested'::"PayoutRequestStatus"
  WHEN 'processing' THEN 'processing'::"PayoutRequestStatus"
  WHEN 'paid' THEN 'paid'::"PayoutRequestStatus"
  WHEN 'failed' THEN 'failed'::"PayoutRequestStatus"
  WHEN 'cancelled' THEN 'cancelled'::"PayoutRequestStatus"
  ELSE 'requested'::"PayoutRequestStatus"
END;

ALTER TABLE "PayoutRequest" DROP COLUMN "status";
ALTER TABLE "PayoutRequest" RENAME COLUMN "statusNew" TO "status";

CREATE UNIQUE INDEX IF NOT EXISTS "Dispute_orderId_key" ON "Dispute"("orderId");
CREATE INDEX IF NOT EXISTS "Order_pspPaymentRef_idx" ON "Order"("pspPaymentRef");
CREATE INDEX IF NOT EXISTS "Order_pspPayoutRef_idx" ON "Order"("pspPayoutRef");
CREATE INDEX IF NOT EXISTS "Order_reviewDeadlineAt_idx" ON "Order"("reviewDeadlineAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutRequest_idempotencyKey_key" ON "PayoutRequest"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutRequest_pspTransferRef_key" ON "PayoutRequest"("pspTransferRef");
CREATE INDEX IF NOT EXISTS "PayoutRequest_status_idx" ON "PayoutRequest"("status");
