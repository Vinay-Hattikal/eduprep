-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'INTERNSHIP', 'CONTRACT');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ShareKind" AS ENUM ('TEST_RESULT', 'CONTEST', 'BADGE');

-- AlterTable
ALTER TABLE "test_sittings" ADD COLUMN     "contest_id" TEXT,
ADD COLUMN     "final_percentile" DOUBLE PRECISION,
ADD COLUMN     "final_rank" INTEGER;

-- AlterTable
ALTER TABLE "user_stats" ADD COLUMN     "freezes_used" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_freeze_on" DATE,
ADD COLUMN     "streak_freezes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "comments_blocked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company_id" TEXT,
    "company_name" TEXT NOT NULL,
    "locations" TEXT[],
    "work_mode" "WorkMode" NOT NULL,
    "job_type" "JobType" NOT NULL,
    "audience" "ProfileType"[],
    "min_experience" INTEGER,
    "max_experience" INTEGER,
    "salary" TEXT,
    "skills" TEXT[],
    "description" TEXT NOT NULL,
    "branches" TEXT[],
    "grad_years" INTEGER[],
    "min_cgpa" DOUBLE PRECISION,
    "max_backlogs" INTEGER,
    "apply_url" TEXT NOT NULL,
    "apply_by" DATE,
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "apply_clicks" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_saves" (
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_saves_pkey" PRIMARY KEY ("user_id","job_id")
);

-- CreateTable
CREATE TABLE "job_apply_clicks" (
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_apply_clicks_pkey" PRIMARY KEY ("user_id","job_id")
);

-- CreateTable
CREATE TABLE "contests" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "blueprint_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_items" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "section_index" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "question_id" TEXT,
    "problem_id" TEXT,

    CONSTRAINT "contest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "drive_date" DATE NOT NULL,
    "round_type" "RoundType" NOT NULL,
    "platform" TEXT,
    "topics" TEXT,
    "questions" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "location" TEXT,
    "status" "ExperienceStatus" NOT NULL DEFAULT 'PENDING',
    "moderator_note" TEXT,
    "moderated_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_comments" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'VISIBLE',
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "flag_count" INTEGER NOT NULL DEFAULT 0,
    "hidden_reason" TEXT,
    "moderated_by_id" TEXT,
    "moderated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_votes" (
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_votes_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateTable
CREATE TABLE "comment_flags" (
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_flags_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "user_id" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3),

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id","badge")
);

-- CreateTable
CREATE TABLE "share_cards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "ShareKind" NOT NULL,
    "ref_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "share_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_slug_key" ON "job_postings"("slug");

-- CreateIndex
CREATE INDEX "job_postings_status_published_at_idx" ON "job_postings"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "contests_slug_key" ON "contests"("slug");

-- CreateIndex
CREATE INDEX "contests_status_starts_at_idx" ON "contests"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "contest_items_contest_id_section_index_position_key" ON "contest_items"("contest_id", "section_index", "position");

-- CreateIndex
CREATE INDEX "drive_reports_company_id_status_drive_date_idx" ON "drive_reports"("company_id", "status", "drive_date");

-- CreateIndex
CREATE INDEX "drive_reports_status_created_at_idx" ON "drive_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "question_comments_question_id_status_created_at_idx" ON "question_comments"("question_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "question_comments_status_flag_count_idx" ON "question_comments"("status", "flag_count");

-- CreateIndex
CREATE INDEX "question_comments_user_id_created_at_idx" ON "question_comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_badges_user_id_earned_at_idx" ON "user_badges"("user_id", "earned_at");

-- CreateIndex
CREATE UNIQUE INDEX "share_cards_user_id_kind_ref_id_key" ON "share_cards"("user_id", "kind", "ref_id");

-- CreateIndex
CREATE INDEX "test_sittings_contest_id_status_score_idx" ON "test_sittings"("contest_id", "status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "test_sittings_contest_id_user_id_key" ON "test_sittings"("contest_id", "user_id");

-- AddForeignKey
ALTER TABLE "test_sittings" ADD CONSTRAINT "test_sittings_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_saves" ADD CONSTRAINT "job_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_saves" ADD CONSTRAINT "job_saves_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_apply_clicks" ADD CONSTRAINT "job_apply_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_apply_clicks" ADD CONSTRAINT "job_apply_clicks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "test_blueprints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_items" ADD CONSTRAINT "contest_items_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_items" ADD CONSTRAINT "contest_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_items" ADD CONSTRAINT "contest_items_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_reports" ADD CONSTRAINT "drive_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_reports" ADD CONSTRAINT "drive_reports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_comments" ADD CONSTRAINT "question_comments_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_comments" ADD CONSTRAINT "question_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_comments" ADD CONSTRAINT "question_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "question_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "question_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "question_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_cards" ADD CONSTRAINT "share_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
