-- "Import for this company" (D-067): rows without companies are tagged with the batch's company.
ALTER TABLE "import_batches" ADD COLUMN "company_id" TEXT;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
