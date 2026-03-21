-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_calleeId_fkey";

-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_callerId_fkey";

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_createdAt_idx" ON "CommunityPost"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_threadId_senderId_readAt_idx" ON "Message"("threadId", "senderId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_type_idx" ON "Notification"("userId", "type");

-- CreateIndex
CREATE INDEX "Order_buyerId_status_createdAt_idx" ON "Order"("buyerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_providerId_status_createdAt_idx" ON "Order"("providerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Thread_buyerId_createdAt_idx" ON "Thread"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Thread_providerId_createdAt_idx" ON "Thread"("providerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
