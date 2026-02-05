-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "communityModeration" JSONB,
ADD COLUMN     "featureFlags" JSONB,
ADD COLUMN     "notificationTemplates" JSONB,
ADD COLUMN     "reviewModeration" JSONB,
ADD COLUMN     "securityControls" JSONB;
