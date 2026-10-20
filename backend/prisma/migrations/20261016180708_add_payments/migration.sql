-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('pending', 'completed', 'cancelled');

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'purchase';

-- CreateTable
CREATE TABLE "roll_packs" (
    "id" TEXT NOT NULL,
    "rolls" INTEGER NOT NULL,
    "price_in_pi" DECIMAL(20,7) NOT NULL,
    "tag" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "roll_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pi_payment_id" TEXT NOT NULL,
    "txid" TEXT,
    "pack_id" TEXT NOT NULL,
    "pi_amount" DECIMAL(20,7) NOT NULL,
    "rolls" INTEGER NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_pi_payment_id_key" ON "purchases"("pi_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_txid_key" ON "purchases"("txid");

-- CreateIndex
CREATE INDEX "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "roll_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Default packs, so a fresh database can sell Rolls without a seed step.
INSERT INTO "roll_packs" ("id", "rolls", "price_in_pi", "tag", "sort_order") VALUES
  ('starter', 10, 0.01, NULL, 1),
  ('popular', 50, 0.05, 'popular', 2),
  ('value', 200, 0.1, 'best value', 3);
