-- Add googleSub to support Google auth linking
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;

-- Unique index for Google subject IDs
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
