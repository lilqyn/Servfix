-- CreateEnum
CREATE TYPE "PhoneOtpMode" AS ENUM ('login', 'register');

-- CreateTable
CREATE TABLE "PhoneOtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "mode" "PhoneOtpMode" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "userAgent" TEXT,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneOtpChallenge_tokenHash_key" ON "PhoneOtpChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "PhoneOtpChallenge_phone_mode_idx" ON "PhoneOtpChallenge"("phone", "mode");

-- CreateIndex
CREATE INDEX "PhoneOtpChallenge_expiresAt_idx" ON "PhoneOtpChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "PhoneOtpChallenge_usedAt_idx" ON "PhoneOtpChallenge"("usedAt");

-- CreateIndex
CREATE INDEX "PhoneOtpChallenge_createdAt_idx" ON "PhoneOtpChallenge"("createdAt");
