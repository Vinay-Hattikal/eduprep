-- "Publish after import" (D-056): the import publishes what it imported.
ALTER TABLE "import_batches" ADD COLUMN "publish_after_import" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "import_batches" ADD COLUMN "published_count" INTEGER NOT NULL DEFAULT 0;
