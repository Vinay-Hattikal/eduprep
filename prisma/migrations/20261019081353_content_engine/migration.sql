-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE', 'MULTIPLE', 'NUMERIC');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('ORIGINAL', 'MEMORY_BASED');

-- CreateEnum
CREATE TYPE "CompanyLevel" AS ENUM ('FULL', 'STANDARD', 'GENERIC');

-- CreateEnum
CREATE TYPE "CompanyCategory" AS ENUM ('SERVICE', 'PRODUCT', 'CONSULTING', 'STARTUP', 'OTHER');

-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('ONLINE_TEST', 'CODING_TEST', 'GROUP_DISCUSSION', 'TECHNICAL_INTERVIEW', 'HR_INTERVIEW', 'MANAGERIAL_INTERVIEW');

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('MCQ', 'CODING');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('TAXONOMY', 'PASSAGES', 'MCQ', 'COMPANIES', 'COMPANY_ROUNDS', 'COMPANY_SECTIONS', 'COMPANY_SOURCES', 'COMPANY_QUESTION_MAP');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'VALIDATING', 'PREVIEW_READY', 'COMMITTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'WARNING', 'ERROR', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowAction" AS ENUM ('CREATE', 'UPDATE', 'UNCHANGED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "subject_id" TEXT NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtopics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "topic_id" TEXT NOT NULL,

    CONSTRAINT "subtopics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passages" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "subtopic_id" TEXT,
    "type" "QuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "code" TEXT,
    "code_language" TEXT,
    "options" TEXT[],
    "correct_options" TEXT[],
    "numeric_answer" DOUBLE PRECISION,
    "tolerance" DOUBLE PRECISION,
    "explanation" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "expected_time_sec" INTEGER NOT NULL,
    "passage_id" TEXT,
    "tags" TEXT[],
    "source" "ContentSource" NOT NULL DEFAULT 'ORIGINAL',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "ai_drafted" BOOLEAN NOT NULL DEFAULT false,
    "author_id" TEXT,
    "reviewer_id" TEXT,
    "review_note" TEXT,
    "submitted_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "import_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "CompanyLevel" NOT NULL,
    "category" "CompanyCategory" NOT NULL,
    "hiring_for" "ProfileType"[],
    "overview" TEXT NOT NULL,
    "website" TEXT,
    "careers_url" TEXT,
    "ctc_fresher" TEXT,
    "ctc_experienced" TEXT,
    "min_cgpa" DOUBLE PRECISION,
    "min_10th_percent" INTEGER,
    "min_12th_percent" INTEGER,
    "max_backlogs" INTEGER,
    "max_gap_years" INTEGER,
    "branches" TEXT[],
    "grad_years" INTEGER[],
    "last_verified_at" DATE NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_rounds" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RoundType" NOT NULL,
    "platform" TEXT,
    "duration_min" INTEGER,
    "is_elimination" BOOLEAN,
    "description" TEXT,

    CONSTRAINT "company_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_sections" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SectionType" NOT NULL,
    "question_count" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "negative_marks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "can_go_back" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "company_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_sources" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "checked_on" DATE NOT NULL,

    CONSTRAINT "company_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "round_order" INTEGER,
    "asked_in" TEXT[],
    "report_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "company_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" TEXT,
    "confirmed_by_id" TEXT,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "warning_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "unchanged_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "action" "ImportRowAction",
    "messages" JSONB NOT NULL DEFAULT '[]',
    "entity_id" TEXT,
    "previous" JSONB,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompanySectionToTopic" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CompanySectionToTopic_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_slug_key" ON "subjects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "topics_subject_id_order_idx" ON "topics"("subject_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "subtopics_topic_id_slug_key" ON "subtopics"("topic_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "passages_external_id_key" ON "passages"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_external_id_key" ON "questions"("external_id");

-- CreateIndex
CREATE INDEX "questions_subject_id_topic_id_status_idx" ON "questions"("subject_id", "topic_id", "status");

-- CreateIndex
CREATE INDEX "questions_status_updated_at_idx" ON "questions"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "company_rounds_company_id_order_key" ON "company_rounds"("company_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "company_sections_round_id_order_key" ON "company_sections"("round_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "company_sources_company_id_url_key" ON "company_sources"("company_id", "url");

-- CreateIndex
CREATE INDEX "company_items_question_id_idx" ON "company_items"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_items_company_id_question_id_key" ON "company_items"("company_id", "question_id");

-- CreateIndex
CREATE INDEX "import_batches_status_created_at_idx" ON "import_batches"("status", "created_at");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_status_idx" ON "import_rows"("batch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "content_versions_entity_type_entity_id_version_idx" ON "content_versions"("entity_type", "entity_id", "version");

-- CreateIndex
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");

-- CreateIndex
CREATE INDEX "_CompanySectionToTopic_B_index" ON "_CompanySectionToTopic"("B");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_rounds" ADD CONSTRAINT "company_rounds_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_sections" ADD CONSTRAINT "company_sections_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "company_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_items" ADD CONSTRAINT "company_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_items" ADD CONSTRAINT "company_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanySectionToTopic" ADD CONSTRAINT "_CompanySectionToTopic_A_fkey" FOREIGN KEY ("A") REFERENCES "company_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanySectionToTopic" ADD CONSTRAINT "_CompanySectionToTopic_B_fkey" FOREIGN KEY ("B") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Duplicate-question detection (data-import.md: similar text warning)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "questions_text_trgm_idx" ON "questions" USING GIN ("text" gin_trgm_ops);
