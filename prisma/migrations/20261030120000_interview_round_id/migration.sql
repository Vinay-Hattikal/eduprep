-- Interview questions point at their round (D-067), so moving or deleting rounds needs no
-- renumbering: a deleted round's questions are simply no longer tied to one.
ALTER TABLE "company_items" ADD COLUMN "round_id" TEXT;
ALTER TABLE "company_items" ADD CONSTRAINT "company_items_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "company_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "company_items" ci
SET "round_id" = r."id", "round_order" = NULL
FROM "company_rounds" r
WHERE ci."design_question_id" IS NOT NULL
  AND r."company_id" = ci."company_id"
  AND r."order" = ci."round_order";
