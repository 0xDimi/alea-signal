-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ResearchDecision" AS ENUM ('YES', 'NO', 'PASS');

-- CreateTable
CREATE TABLE "ScoreHistory" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "components" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "refs" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "weights" JSONB NOT NULL,
    "penalties" JSONB NOT NULL,
    "flagsThresholds" JSONB NOT NULL,
    "refPercentile" DOUBLE PRECISION,
    "memoMaxDays" INTEGER,
    "scoreVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchPack" (
    "marketId" TEXT NOT NULL,
    "marketProbability" DOUBLE PRECISION,
    "aleaProbability" DOUBLE PRECISION,
    "delta" DOUBLE PRECISION,
    "confidence" "ConfidenceLevel",
    "decision" "ResearchDecision",
    "nextCatalystDate" TIMESTAMP(3),
    "nextCatalystNote" TEXT,
    "resolutionRules" TEXT,
    "sources" JSONB,
    "evidenceChecklist" JSONB,
    "leadingIndicators" JSONB,
    "keyRisks" JSONB,
    "marketDrivers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchPack_pkey" PRIMARY KEY ("marketId")
);

-- CreateIndex
CREATE INDEX "ScoreHistory_marketId_computedAt_idx" ON "ScoreHistory"("marketId", "computedAt");

-- AddForeignKey
ALTER TABLE "ScoreHistory" ADD CONSTRAINT "ScoreHistory_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchPack" ADD CONSTRAINT "ResearchPack_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
