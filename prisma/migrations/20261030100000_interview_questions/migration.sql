-- Interview questions per company (D-067): technical and HR kinds for design questions, and
-- company links (company_items) instead of the companies slug list.

ALTER TYPE "DesignKind" ADD VALUE IF NOT EXISTS 'TECHNICAL';
ALTER TYPE "DesignKind" ADD VALUE IF NOT EXISTS 'HR';

ALTER TABLE "company_items" ADD COLUMN IF NOT EXISTS "design_question_id" TEXT;

-- Copy every "asked at" slug that names a company into a link, then drop the list.
INSERT INTO "company_items" ("id", "company_id", "design_question_id", "asked_in", "report_count")
SELECT 'ci' || md5(dq."id" || c."id"), c."id", dq."id", '{}', 0
FROM "design_questions" dq
CROSS JOIN LATERAL unnest(dq."companies") AS asked(company_slug)
JOIN "companies" c ON c."slug" = asked.company_slug
ON CONFLICT DO NOTHING;

ALTER TABLE "design_questions" DROP COLUMN "companies";

CREATE INDEX "company_items_design_question_id_idx" ON "company_items"("design_question_id");
CREATE UNIQUE INDEX "company_items_company_id_design_question_id_key" ON "company_items"("company_id", "design_question_id");
ALTER TABLE "company_items" ADD CONSTRAINT "company_items_design_question_id_fkey" FOREIGN KEY ("design_question_id") REFERENCES "design_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
