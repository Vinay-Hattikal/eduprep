-- CreateEnum
CREATE TYPE "ScoringMode" AS ENUM ('ALL_OR_NOTHING', 'PER_TEST');

-- CreateEnum
CREATE TYPE "SolutionKind" AS ENUM ('REFERENCE', 'BRUTE', 'STARTER');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('RUN', 'SUBMIT');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('PENDING', 'RUNNING', 'ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "TestKind" AS ENUM ('TOPIC', 'COMPANY_MOCK', 'OA');

-- CreateEnum
CREATE TYPE "PlatformStyle" AS ENUM ('GENERIC', 'TCS_ION', 'HACKERRANK', 'AMCAT');

-- CreateEnum
CREATE TYPE "SectionNavigation" AS ENUM ('SEQUENTIAL', 'FREE');

-- CreateEnum
CREATE TYPE "SittingStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "AttemptMode" ADD VALUE 'TEST';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportType" ADD VALUE 'CODING_PROBLEMS';
ALTER TYPE "ImportType" ADD VALUE 'CODING_TESTCASES';
ALTER TYPE "ImportType" ADD VALUE 'CODING_SOLUTIONS';
ALTER TYPE "ImportType" ADD VALUE 'CODING_PACKAGE';

-- AlterTable
ALTER TABLE "company_items" ADD COLUMN     "problem_id" TEXT,
ALTER COLUMN "question_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "statement" TEXT NOT NULL,
    "input_format" TEXT NOT NULL,
    "output_format" TEXT NOT NULL,
    "constraints" TEXT NOT NULL,
    "time_limit_ms" INTEGER NOT NULL,
    "memory_limit_mb" INTEGER NOT NULL,
    "languages" TEXT[],
    "scoring" "ScoringMode" NOT NULL DEFAULT 'ALL_OR_NOTHING',
    "checker" TEXT NOT NULL DEFAULT 'exact',
    "hints" TEXT[],
    "editorial" TEXT,
    "source" "ContentSource" NOT NULL DEFAULT 'ORIGINAL',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "author_id" TEXT,
    "reviewer_id" TEXT,
    "review_note" TEXT,
    "import_batch_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "validation_note" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_test_cases" (
    "id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "is_sample" BOOLEAN NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "problem_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_solutions" (
    "id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "kind" "SolutionKind" NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "problem_solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "sitting_item_id" TEXT,
    "kind" "SubmissionKind" NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "custom_input" TEXT,
    "verdict" "Verdict" NOT NULL DEFAULT 'PENDING',
    "tests_passed" INTEGER NOT NULL DEFAULT 0,
    "tests_total" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "runtime_ms" INTEGER,
    "compile_output" TEXT,
    "results" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_progress" (
    "user_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "hints_revealed" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "solved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_progress_pkey" PRIMARY KEY ("user_id","problem_id")
);

-- CreateTable
CREATE TABLE "test_blueprints" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "TestKind" NOT NULL,
    "platform_style" "PlatformStyle" NOT NULL DEFAULT 'GENERIC',
    "navigation" "SectionNavigation" NOT NULL DEFAULT 'FREE',
    "instructions" TEXT,
    "company_id" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blueprint_sections" (
    "id" TEXT NOT NULL,
    "blueprint_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SectionType" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "marks_per_item" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "negative_marks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "can_go_back" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "blueprint_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blueprint_rules" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "difficulty" "Difficulty",
    "count" INTEGER NOT NULL,

    CONSTRAINT "blueprint_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_sittings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "blueprint_id" TEXT NOT NULL,
    "status" "SittingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL,
    "sections" JSONB NOT NULL,
    "section_starts" JSONB NOT NULL DEFAULT '[]',
    "ends_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "auto_submitted" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,
    "max_score" DOUBLE PRECISION,
    "tab_switches" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_sittings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitting_items" (
    "id" TEXT NOT NULL,
    "sitting_id" TEXT NOT NULL,
    "section_index" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "question_id" TEXT,
    "problem_id" TEXT,
    "selected_options" TEXT[],
    "numeric_answer" DOUBLE PRECISION,
    "marked_for_review" BOOLEAN NOT NULL DEFAULT false,
    "visited" BOOLEAN NOT NULL DEFAULT false,
    "time_sec" INTEGER NOT NULL DEFAULT 0,
    "is_correct" BOOLEAN,
    "marks" DOUBLE PRECISION,

    CONSTRAINT "sitting_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProblemToTopic" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProblemToTopic_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "problems_external_id_key" ON "problems"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "problems_slug_key" ON "problems"("slug");

-- CreateIndex
CREATE INDEX "problems_status_difficulty_idx" ON "problems"("status", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "problem_test_cases_problem_id_order_key" ON "problem_test_cases"("problem_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "problem_solutions_problem_id_kind_language_key" ON "problem_solutions"("problem_id", "kind", "language");

-- CreateIndex
CREATE INDEX "submissions_user_id_problem_id_created_at_idx" ON "submissions"("user_id", "problem_id", "created_at");

-- CreateIndex
CREATE INDEX "submissions_user_id_created_at_idx" ON "submissions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_blueprints_slug_key" ON "test_blueprints"("slug");

-- CreateIndex
CREATE INDEX "test_blueprints_status_kind_idx" ON "test_blueprints"("status", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "blueprint_sections_blueprint_id_order_key" ON "blueprint_sections"("blueprint_id", "order");

-- CreateIndex
CREATE INDEX "test_sittings_user_id_created_at_idx" ON "test_sittings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "test_sittings_blueprint_id_status_idx" ON "test_sittings"("blueprint_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sitting_items_sitting_id_section_index_position_key" ON "sitting_items"("sitting_id", "section_index", "position");

-- CreateIndex
CREATE INDEX "_ProblemToTopic_B_index" ON "_ProblemToTopic"("B");

-- CreateIndex
CREATE INDEX "company_items_problem_id_idx" ON "company_items"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_items_company_id_problem_id_key" ON "company_items"("company_id", "problem_id");

-- AddForeignKey
ALTER TABLE "company_items" ADD CONSTRAINT "company_items_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_test_cases" ADD CONSTRAINT "problem_test_cases_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_solutions" ADD CONSTRAINT "problem_solutions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sitting_item_id_fkey" FOREIGN KEY ("sitting_item_id") REFERENCES "sitting_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_progress" ADD CONSTRAINT "problem_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_progress" ADD CONSTRAINT "problem_progress_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_blueprints" ADD CONSTRAINT "test_blueprints_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprint_sections" ADD CONSTRAINT "blueprint_sections_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "test_blueprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprint_rules" ADD CONSTRAINT "blueprint_rules_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "blueprint_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blueprint_rules" ADD CONSTRAINT "blueprint_rules_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sittings" ADD CONSTRAINT "test_sittings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sittings" ADD CONSTRAINT "test_sittings_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "test_blueprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitting_items" ADD CONSTRAINT "sitting_items_sitting_id_fkey" FOREIGN KEY ("sitting_id") REFERENCES "test_sittings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitting_items" ADD CONSTRAINT "sitting_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitting_items" ADD CONSTRAINT "sitting_items_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProblemToTopic" ADD CONSTRAINT "_ProblemToTopic_A_fkey" FOREIGN KEY ("A") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProblemToTopic" ADD CONSTRAINT "_ProblemToTopic_B_fkey" FOREIGN KEY ("B") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
