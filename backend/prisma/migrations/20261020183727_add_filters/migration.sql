-- CreateEnum
CREATE TYPE "CountryMode" AS ENUM ('include', 'exclude');

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'unlock';

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "age_filter_cost" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "base_roll_cost" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "country_filter_cost" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "exclude_slot_price" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "free_exclude_slots" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "free_include_slots" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "gender_filter_cost" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "include_slot_price" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "max_extra_exclude_slots" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "max_extra_include_slots" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "match_filters" (
    "user_id" TEXT NOT NULL,
    "age_enabled" BOOLEAN NOT NULL DEFAULT false,
    "min_age" INTEGER NOT NULL DEFAULT 18,
    "max_age" INTEGER NOT NULL DEFAULT 99,
    "gender_enabled" BOOLEAN NOT NULL DEFAULT false,
    "gender" "Gender",
    "country_enabled" BOOLEAN NOT NULL DEFAULT false,
    "country_mode" "CountryMode" NOT NULL DEFAULT 'include',
    "include_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclude_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra_include_slots" INTEGER NOT NULL DEFAULT 0,
    "extra_exclude_slots" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_filters_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "match_filters" ADD CONSTRAINT "match_filters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The app validates codes against the shared list; this stops garbage from manual edits.
ALTER TABLE "match_filters" ADD CONSTRAINT "match_filters_country_codes_check"
  CHECK (array_to_string("include_countries" || "exclude_countries", ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$');

ALTER TABLE "match_filters" ADD CONSTRAINT "match_filters_age_range_check"
  CHECK ("min_age" <= "max_age");
