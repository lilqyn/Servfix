-- AddSequence
CREATE SEQUENCE "SupportTicket_ticketNumber_seq";

-- AddColumn
ALTER TABLE "SupportTicket" ADD COLUMN "ticketNumber" INTEGER;

-- Backfill existing tickets with sequential numbers (oldest first)
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn
  FROM "SupportTicket"
)
UPDATE "SupportTicket"
SET "ticketNumber" = ordered.rn
FROM ordered
WHERE "SupportTicket".id = ordered.id;

-- Set sequence to max ticketNumber (or 1 if none)
SELECT setval(
  '"SupportTicket_ticketNumber_seq"',
  COALESCE((SELECT MAX("ticketNumber") FROM "SupportTicket"), 1),
  (SELECT MAX("ticketNumber") FROM "SupportTicket") IS NOT NULL
);

-- Set default + not null and ownership
ALTER TABLE "SupportTicket"
  ALTER COLUMN "ticketNumber" SET DEFAULT nextval('"SupportTicket_ticketNumber_seq"'),
  ALTER COLUMN "ticketNumber" SET NOT NULL;

ALTER SEQUENCE "SupportTicket_ticketNumber_seq" OWNED BY "SupportTicket"."ticketNumber";

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
