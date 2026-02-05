-- CreateTable
CREATE TABLE "HomeContent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hero" JSONB NOT NULL,
    "categories" JSONB NOT NULL,
    "howItWorks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomeContent_key_key" ON "HomeContent"("key");
