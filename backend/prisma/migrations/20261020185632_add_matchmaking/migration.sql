-- CreateEnum
CREATE TYPE "MatchTicketStatus" AS ENUM ('waiting', 'matched', 'cancelled', 'expired');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerEntryType" ADD VALUE 'hold';
ALTER TYPE "LedgerEntryType" ADD VALUE 'spend';
ALTER TYPE "LedgerEntryType" ADD VALUE 'refund';

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "match_timeout_seconds" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "match_tickets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "MatchTicketStatus" NOT NULL DEFAULT 'waiting',
    "roll_cost" INTEGER NOT NULL,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "match_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "ended_by_id" TEXT,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_tickets_status_idx" ON "match_tickets"("status");

-- CreateIndex
CREATE INDEX "match_tickets_user_id_created_at_idx" ON "match_tickets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_sessions_ended_at_idx" ON "chat_sessions"("ended_at");

-- AddForeignKey
ALTER TABLE "match_tickets" ADD CONSTRAINT "match_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_tickets" ADD CONSTRAINT "match_tickets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
