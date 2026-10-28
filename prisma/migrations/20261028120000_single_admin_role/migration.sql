-- One admin role does everything (D-056): every admin role becomes ADMIN.
-- Postgres can't drop enum values, so the type is rebuilt. A column type change can't use a
-- subquery, so roles are copied through a new column.

ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('STUDENT', 'INTERVIEWER', 'ADMIN');

ALTER TABLE "users" ADD COLUMN "roles_new" "Role"[] DEFAULT ARRAY['STUDENT']::"Role"[];

UPDATE "users" u SET "roles_new" = COALESCE(
  (
    SELECT array_agg(DISTINCT mapped ORDER BY mapped)
    FROM (
      SELECT CASE
        WHEN r::text IN ('SUPER_ADMIN', 'CONTENT_AUTHOR', 'REVIEWER', 'OPS_ADMIN', 'SUPPORT_ADMIN')
          THEN 'ADMIN'::"Role"
        ELSE r::text::"Role"
      END AS mapped
      FROM unnest(u."roles") AS r
    ) m
  ),
  ARRAY['STUDENT']::"Role"[]
);

ALTER TABLE "users" DROP COLUMN "roles";
ALTER TABLE "users" RENAME COLUMN "roles_new" TO "roles";
DROP TYPE "Role_old";

-- No review step any more: anything waiting for review becomes a draft.
UPDATE "questions" SET "status" = 'DRAFT' WHERE "status" = 'IN_REVIEW';
UPDATE "companies" SET "status" = 'DRAFT' WHERE "status" = 'IN_REVIEW';
UPDATE "problems" SET "status" = 'DRAFT' WHERE "status" = 'IN_REVIEW';
UPDATE "test_blueprints" SET "status" = 'DRAFT' WHERE "status" = 'IN_REVIEW';
UPDATE "role_tracks" SET "status" = 'DRAFT' WHERE "status" = 'IN_REVIEW';
UPDATE "design_questions" SET "status" = 'DRAFT' WHERE "status" = 'IN_REVIEW';
UPDATE "contests" SET "status" = 'DRAFT' WHERE "status" = 'IN_REVIEW';
