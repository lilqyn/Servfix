-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'service_updated';
ALTER TYPE "NotificationType" ADD VALUE 'provider_five_star_review';
ALTER TYPE "NotificationType" ADD VALUE 'provider_verified';
ALTER TYPE "NotificationType" ADD VALUE 'provider_milestone';

-- AlterTable
ALTER TABLE "UserFollow" ADD COLUMN     "notifyPosts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyServices" BOOLEAN NOT NULL DEFAULT true;
