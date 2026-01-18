-- CreateEnum
CREATE TYPE "MarketState" AS ENUM ('NEW', 'ON_DECK', 'ACTIVE', 'ARCHIVE');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "slug" TEXT,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "resolutionSource" TEXT,
    "endDate" TIMESTAMP(3),
    "liquidity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openInterest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tags" JSONB NOT NULL,
    "outcomes" JSONB,
    "isMultiOutcome" BOOLEAN NOT NULL DEFAULT false,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "marketUrl" TEXT,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "marketId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "components" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "refs" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "marketId" TEXT NOT NULL,
    "state" "MarketState" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "owner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "SyncStatus" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptedSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastStats" JSONB,
    "lastRefs" JSONB,

    CONSTRAINT "SyncStatus_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
