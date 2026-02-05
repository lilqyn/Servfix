-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundCompletedAt" TIMESTAMP(3),
ADD COLUMN     "refundProvider" "PaymentProvider",
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "refundRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_refundReference_idx" ON "Order"("refundReference");
