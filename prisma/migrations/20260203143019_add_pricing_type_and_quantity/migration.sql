-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('flat', 'per_unit');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ServiceTier" ADD COLUMN     "pricingType" "PricingType" NOT NULL DEFAULT 'flat',
ADD COLUMN     "unitLabel" TEXT;
