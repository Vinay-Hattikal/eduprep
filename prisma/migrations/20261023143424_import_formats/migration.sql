-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('ADD_UPDATE', 'REPLACE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportType" ADD VALUE 'CODING_BUNDLE';
ALTER TYPE "ImportType" ADD VALUE 'COMPANY_PROCESS';

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "archive_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "archive_preview" TEXT[],
ADD COLUMN     "archived_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "backup_key" TEXT,
ADD COLUMN     "mode" "ImportMode" NOT NULL DEFAULT 'ADD_UPDATE';
