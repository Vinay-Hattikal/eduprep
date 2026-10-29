-- Content packs (D-061): a ZIP of a whole content folder, imported file by file.

-- CreateEnum
CREATE TYPE "ContentPackStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "pack_id" TEXT;

-- CreateTable
CREATE TABLE "content_packs" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "status" "ContentPackStatus" NOT NULL DEFAULT 'QUEUED',
    "publish" BOOLEAN NOT NULL DEFAULT false,
    "unknown_files" TEXT[],
    "results" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "content_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_packs_created_at_idx" ON "content_packs"("created_at");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "content_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_packs" ADD CONSTRAINT "content_packs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

