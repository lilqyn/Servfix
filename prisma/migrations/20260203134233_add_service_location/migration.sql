-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "advanceBookingDays" INTEGER,
ADD COLUMN     "availabilityDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "availabilityEndTime" TEXT,
ADD COLUMN     "availabilityStartTime" TEXT,
ADD COLUMN     "isRemote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locationAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "locationCity" TEXT,
ADD COLUMN     "maxBookingsPerDay" INTEGER;
