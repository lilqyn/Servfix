/*
  Warnings:

  - You are about to drop the column `orderId` on the `PaymentIntent` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'stripe';

-- DropForeignKey
ALTER TABLE "PaymentIntent" DROP CONSTRAINT "PaymentIntent_orderId_fkey";

-- DropIndex
DROP INDEX "PaymentIntent_orderId_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "PaymentIntent" DROP COLUMN "orderId";

-- CreateIndex
CREATE INDEX "Order_paymentIntentId_idx" ON "Order"("paymentIntentId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
