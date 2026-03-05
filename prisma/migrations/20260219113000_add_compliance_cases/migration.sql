DO $$
BEGIN
  CREATE TYPE "ComplianceCaseType" AS ENUM ('aml_payout', 'sanctions_match');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ComplianceCaseStatus" AS ENUM ('open', 'investigating', 'cleared', 'escalated', 'reported', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ComplianceCaseSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SanctionsScreeningStatus" AS ENUM ('pending', 'clear', 'possible_match', 'confirmed_match', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SanctionsScreening" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "status" "SanctionsScreeningStatus" NOT NULL DEFAULT 'pending',
  "matchScore" INTEGER NOT NULL DEFAULT 0,
  "watchlistSource" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SanctionsScreening_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ComplianceCase" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "payoutRequestId" TEXT,
  "screeningId" TEXT,
  "type" "ComplianceCaseType" NOT NULL,
  "status" "ComplianceCaseStatus" NOT NULL DEFAULT 'open',
  "severity" "ComplianceCaseSeverity" NOT NULL DEFAULT 'medium',
  "riskScore" INTEGER,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "assignedToId" TEXT,
  "createdById" TEXT,
  "closedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComplianceCase_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "SanctionsScreening"
    ADD CONSTRAINT "SanctionsScreening_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "SanctionsScreening"
    ADD CONSTRAINT "SanctionsScreening_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ComplianceCase"
    ADD CONSTRAINT "ComplianceCase_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ComplianceCase"
    ADD CONSTRAINT "ComplianceCase_payoutRequestId_fkey"
    FOREIGN KEY ("payoutRequestId") REFERENCES "PayoutRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ComplianceCase"
    ADD CONSTRAINT "ComplianceCase_screeningId_fkey"
    FOREIGN KEY ("screeningId") REFERENCES "SanctionsScreening"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ComplianceCase"
    ADD CONSTRAINT "ComplianceCase_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ComplianceCase"
    ADD CONSTRAINT "ComplianceCase_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ComplianceCase"
    ADD CONSTRAINT "ComplianceCase_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SanctionsScreening_providerId_screenedAt_idx"
  ON "SanctionsScreening"("providerId", "screenedAt");
CREATE INDEX IF NOT EXISTS "SanctionsScreening_providerId_status_idx"
  ON "SanctionsScreening"("providerId", "status");
CREATE INDEX IF NOT EXISTS "SanctionsScreening_status_screenedAt_idx"
  ON "SanctionsScreening"("status", "screenedAt");
CREATE INDEX IF NOT EXISTS "SanctionsScreening_reviewedById_idx"
  ON "SanctionsScreening"("reviewedById");

CREATE INDEX IF NOT EXISTS "ComplianceCase_providerId_idx"
  ON "ComplianceCase"("providerId");
CREATE INDEX IF NOT EXISTS "ComplianceCase_payoutRequestId_idx"
  ON "ComplianceCase"("payoutRequestId");
CREATE INDEX IF NOT EXISTS "ComplianceCase_screeningId_idx"
  ON "ComplianceCase"("screeningId");
CREATE INDEX IF NOT EXISTS "ComplianceCase_status_createdAt_idx"
  ON "ComplianceCase"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ComplianceCase_severity_createdAt_idx"
  ON "ComplianceCase"("severity", "createdAt");
CREATE INDEX IF NOT EXISTS "ComplianceCase_type_createdAt_idx"
  ON "ComplianceCase"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "ComplianceCase_assignedToId_idx"
  ON "ComplianceCase"("assignedToId");
