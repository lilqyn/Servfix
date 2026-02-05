-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "providerReply" TEXT,
ADD COLUMN     "providerReplyAt" TIMESTAMP(3),
ADD COLUMN     "providerReplyUpdatedAt" TIMESTAMP(3);
