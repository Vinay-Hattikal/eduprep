-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('PRACTICE', 'RETRY', 'DAILY');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('WRONG_ANSWER', 'WRONG_EXPLANATION', 'TYPO', 'UNCLEAR', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'FIXED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "preferred_language" TEXT;

-- CreateTable
CREATE TABLE "target_companies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "target_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "mode" "AttemptMode" NOT NULL DEFAULT 'PRACTICE',
    "selected_options" TEXT[],
    "numeric_answer" DOUBLE PRECISION,
    "is_correct" BOOLEAN NOT NULL,
    "time_sec" INTEGER NOT NULL,
    "activity_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery" (
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "weight_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "correct_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mastery_pkey" PRIMARY KEY ("user_id","topic_id")
);

-- CreateTable
CREATE TABLE "mistakes" (
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "last_wrong_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "mistakes_pkey" PRIMARY KEY ("user_id","question_id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("user_id","question_id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "user_id" TEXT NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" DATE,
    "total_attempts" INTEGER NOT NULL DEFAULT 0,
    "total_correct" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "error_reports" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "user_id" TEXT,
    "reason" "ReportReason" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "error_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_questions" (
    "date" DATE NOT NULL,
    "question_id" TEXT NOT NULL,

    CONSTRAINT "daily_questions_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_companies_user_id_company_id_key" ON "target_companies"("user_id", "company_id");

-- CreateIndex
CREATE INDEX "attempts_user_id_created_at_idx" ON "attempts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "attempts_user_id_activity_date_idx" ON "attempts"("user_id", "activity_date");

-- CreateIndex
CREATE INDEX "attempts_user_id_question_id_idx" ON "attempts"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "attempts_question_id_idx" ON "attempts"("question_id");

-- CreateIndex
CREATE INDEX "mistakes_user_id_resolved_at_idx" ON "mistakes"("user_id", "resolved_at");

-- CreateIndex
CREATE INDEX "error_reports_status_created_at_idx" ON "error_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "error_reports_user_id_created_at_idx" ON "error_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "company_requests_normalized_idx" ON "company_requests"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "company_requests_user_id_normalized_key" ON "company_requests"("user_id", "normalized");

-- AddForeignKey
ALTER TABLE "target_companies" ADD CONSTRAINT "target_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_companies" ADD CONSTRAINT "target_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery" ADD CONSTRAINT "mastery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery" ADD CONSTRAINT "mastery_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistakes" ADD CONSTRAINT "mistakes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_reports" ADD CONSTRAINT "error_reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_reports" ADD CONSTRAINT "error_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_reports" ADD CONSTRAINT "error_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_requests" ADD CONSTRAINT "company_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_questions" ADD CONSTRAINT "daily_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
