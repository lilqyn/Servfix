-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "disputePolicy" JSONB,
ADD COLUMN     "orderRules" JSONB,
ADD COLUMN     "payoutRules" JSONB,
ADD COLUMN     "platformFeeBps" INTEGER,
ADD COLUMN     "providerVerification" JSONB,
ADD COLUMN     "taxBps" INTEGER;
