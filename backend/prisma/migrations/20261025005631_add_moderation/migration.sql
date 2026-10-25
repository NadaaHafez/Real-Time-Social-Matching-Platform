-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('harassment', 'sexual_content', 'scam_or_spam', 'underage', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'actioned', 'dismissed');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('warn', 'suspend', 'ban', 'dismiss');

-- CreateEnum
CREATE TYPE "SessionEndReason" AS ENUM ('left', 'reported', 'moderated');

-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "ended_reason" "SessionEndReason";

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "block_hours" INTEGER NOT NULL DEFAULT 72;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "warned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reported_user_id" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "note" TEXT,
    "messages" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "action" "ModerationAction",
    "reviewed_by_id" TEXT,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_reported_user_id_created_at_idx" ON "reports"("reported_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_session_id_reporter_id_key" ON "reports"("session_id", "reporter_id");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
