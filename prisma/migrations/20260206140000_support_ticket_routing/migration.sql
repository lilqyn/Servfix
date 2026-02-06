-- CreateEnum
CREATE TYPE "SupportDepartment" AS ENUM ('general', 'customer_service', 'finance', 'accounting', 'operations', 'disputes', 'technical');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "SupportTicketEventType" AS ENUM ('created', 'status_changed', 'assigned', 'forwarded', 'note_added', 'meeting_scheduled', 'meeting_updated', 'meeting_cancelled');

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "assignedUserId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "assignedRole" "UserRole";
ALTER TABLE "SupportTicket" ADD COLUMN "department" "SupportDepartment" NOT NULL DEFAULT 'general';
ALTER TABLE "SupportTicket" ADD COLUMN "priority" "SupportTicketPriority" NOT NULL DEFAULT 'medium';

-- AlterTable
ALTER TABLE "SupportTicketMessage" ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupportTicketMeeting" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "meetingUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "SupportTicketEventType" NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicket_assignedUserId_idx" ON "SupportTicket"("assignedUserId");
CREATE INDEX "SupportTicket_assignedRole_idx" ON "SupportTicket"("assignedRole");
CREATE INDEX "SupportTicket_department_idx" ON "SupportTicket"("department");
CREATE INDEX "SupportTicket_priority_idx" ON "SupportTicket"("priority");

CREATE INDEX "SupportTicketMeeting_ticketId_idx" ON "SupportTicketMeeting"("ticketId");
CREATE INDEX "SupportTicketMeeting_scheduledAt_idx" ON "SupportTicketMeeting"("scheduledAt");

CREATE INDEX "SupportTicketEvent_ticketId_idx" ON "SupportTicketEvent"("ticketId");
CREATE INDEX "SupportTicketEvent_actorId_idx" ON "SupportTicketEvent"("actorId");
CREATE INDEX "SupportTicketEvent_createdAt_idx" ON "SupportTicketEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicketMeeting" ADD CONSTRAINT "SupportTicketMeeting_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMeeting" ADD CONSTRAINT "SupportTicketMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
