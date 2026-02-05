-- CreateTable
CREATE TABLE "PlatformSettings" (
    "key" TEXT NOT NULL,
    "businessFunctions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("key")
);
