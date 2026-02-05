-- CreateEnum
CREATE TYPE "MomoNetwork" AS ENUM ('mtn', 'vodafone', 'airteltigo');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'payout_update';

-- AlterTable
ALTER TABLE "PayoutRequest" ADD COLUMN     "momoNetwork" "MomoNetwork";

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "momoNetwork" "MomoNetwork";
