-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('buyer', 'provider', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "ProviderVerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('draft', 'published', 'suspended');

-- CreateEnum
CREATE TYPE "TierName" AS ENUM ('basic', 'standard', 'premium');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('created', 'paid_to_escrow', 'accepted', 'in_progress', 'delivered', 'approved', 'released', 'cancelled', 'expired', 'disputed', 'refund_pending', 'refunded', 'chargeback');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('created', 'paid', 'accepted', 'started', 'delivered', 'approved', 'released', 'cancelled', 'expired', 'dispute_opened', 'dispute_resolved', 'refund_initiated', 'refunded', 'chargeback', 'admin_action');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('escrow_credit', 'escrow_debit', 'platform_fee', 'tax', 'provider_earnings', 'refund', 'chargeback', 'adjustment', 'payout');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('GHS', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('paystack', 'flutterwave', 'other');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('created', 'pending', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentEventStatus" AS ENUM ('received', 'processed', 'ignored', 'failed');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "BoostType" AS ENUM ('featured', 'feed_boost', 'category_top');

-- CreateEnum
CREATE TYPE "BoostStatus" AS ENUM ('scheduled', 'active', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'investigating', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('refund', 'release', 'partial_refund', 'deny');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('active', 'archived');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "phone" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProfile" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "location" TEXT,
    "categories" TEXT[],
    "momoNumber" TEXT,
    "verificationStatus" "ProviderVerificationStatus" NOT NULL DEFAULT 'unverified',
    "ratingAvg" DECIMAL(4,2) NOT NULL DEFAULT 0.0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "status" "ServiceStatus" NOT NULL DEFAULT 'draft',
    "coverMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTier" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" "TierName" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "deliveryDays" INTEGER NOT NULL,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMedia" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'created',
    "amountGross" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "amountNetProvider" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'created',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "providerRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "status" "PaymentEventStatus" NOT NULL DEFAULT 'received',
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderWallet" (
    "providerId" TEXT NOT NULL,
    "availableBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "pendingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderWallet_pkey" PRIMARY KEY ("providerId")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "reference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "destinationMomo" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "benefits" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSubscription" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "renewsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "providerRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostPurchase" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT,
    "type" "BoostType" NOT NULL,
    "status" "BoostStatus" NOT NULL DEFAULT 'scheduled',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'GHS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoostPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "ThreadStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" "DisputeResolution",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "ProviderProfile_verificationStatus_idx" ON "ProviderProfile"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Service_coverMediaId_key" ON "Service"("coverMediaId");

-- CreateIndex
CREATE INDEX "Service_providerId_idx" ON "Service"("providerId");

-- CreateIndex
CREATE INDEX "Service_status_idx" ON "Service"("status");

-- CreateIndex
CREATE INDEX "Service_category_idx" ON "Service"("category");

-- CreateIndex
CREATE INDEX "ServiceTier_serviceId_idx" ON "ServiceTier"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTier_serviceId_name_key" ON "ServiceTier"("serviceId", "name");

-- CreateIndex
CREATE INDEX "ServiceMedia_serviceId_idx" ON "ServiceMedia"("serviceId");

-- CreateIndex
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");

-- CreateIndex
CREATE INDEX "Order_providerId_idx" ON "Order"("providerId");

-- CreateIndex
CREATE INDEX "Order_serviceId_idx" ON "Order"("serviceId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_type_idx" ON "OrderEvent"("type");

-- CreateIndex
CREATE INDEX "OrderEvent_createdAt_idx" ON "OrderEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_providerRef_key" ON "PaymentIntent"("providerRef");

-- CreateIndex
CREATE INDEX "PaymentIntent_orderId_idx" ON "PaymentIntent"("orderId");

-- CreateIndex
CREATE INDEX "PaymentIntent_provider_idx" ON "PaymentIntent"("provider");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- CreateIndex
CREATE INDEX "PaymentEvent_status_idx" ON "PaymentEvent"("status");

-- CreateIndex
CREATE INDEX "PaymentEvent_receivedAt_idx" ON "PaymentEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_paymentIntentId_key" ON "PaymentEvent"("providerEventId", "paymentIntentId");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_idx" ON "LedgerEntry"("userId");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_idx" ON "LedgerEntry"("type");

-- CreateIndex
CREATE INDEX "LedgerEntry_createdAt_idx" ON "LedgerEntry"("createdAt");

-- CreateIndex
CREATE INDEX "PayoutRequest_providerId_idx" ON "PayoutRequest"("providerId");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_idx" ON "PayoutRequest"("status");

-- CreateIndex
CREATE INDEX "PayoutRequest_createdAt_idx" ON "PayoutRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSubscription_providerRef_key" ON "ProviderSubscription"("providerRef");

-- CreateIndex
CREATE INDEX "ProviderSubscription_providerId_idx" ON "ProviderSubscription"("providerId");

-- CreateIndex
CREATE INDEX "ProviderSubscription_status_idx" ON "ProviderSubscription"("status");

-- CreateIndex
CREATE INDEX "ProviderSubscription_renewsAt_idx" ON "ProviderSubscription"("renewsAt");

-- CreateIndex
CREATE INDEX "BoostPurchase_providerId_idx" ON "BoostPurchase"("providerId");

-- CreateIndex
CREATE INDEX "BoostPurchase_serviceId_idx" ON "BoostPurchase"("serviceId");

-- CreateIndex
CREATE INDEX "BoostPurchase_type_idx" ON "BoostPurchase"("type");

-- CreateIndex
CREATE INDEX "BoostPurchase_status_idx" ON "BoostPurchase"("status");

-- CreateIndex
CREATE INDEX "BoostPurchase_startsAt_idx" ON "BoostPurchase"("startsAt");

-- CreateIndex
CREATE INDEX "Thread_buyerId_idx" ON "Thread"("buyerId");

-- CreateIndex
CREATE INDEX "Thread_providerId_idx" ON "Thread"("providerId");

-- CreateIndex
CREATE INDEX "Thread_orderId_idx" ON "Thread"("orderId");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Dispute_orderId_idx" ON "Dispute"("orderId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_createdAt_idx" ON "Dispute"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "ServiceMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTier" ADD CONSTRAINT "ServiceTier_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMedia" ADD CONSTRAINT "ServiceMedia_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "ServiceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderWallet" ADD CONSTRAINT "ProviderWallet_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubscription" ADD CONSTRAINT "ProviderSubscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubscription" ADD CONSTRAINT "ProviderSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostPurchase" ADD CONSTRAINT "BoostPurchase_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostPurchase" ADD CONSTRAINT "BoostPurchase_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
