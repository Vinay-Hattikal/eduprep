-- CreateEnum
CREATE TYPE "InterviewerStatus" AS ENUM ('APPLIED', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InterviewAudience" AS ENUM ('FRESHER', 'EXPERIENCED', 'BOTH');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW_CANDIDATE', 'NO_SHOW_INTERVIEWER');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('HIRE', 'BORDERLINE', 'NOT_YET');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('EARNING', 'PENALTY', 'ADJUSTMENT', 'PAYOUT');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('PRO', 'COMPANY_PACK', 'INTERVIEW_CREDITS');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EntitlementKind" AS ENUM ('PRO', 'COMPANY_PACK');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('AVAILABLE', 'USED', 'REVOKED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DesignKind" AS ENUM ('SYSTEM_DESIGN', 'LOW_LEVEL_DESIGN');

-- CreateEnum
CREATE TYPE "ExperienceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExperienceResult" AS ENUM ('SELECTED', 'REJECTED', 'WAITING', 'WITHDREW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportType" ADD VALUE 'ROLE_TRACKS';
ALTER TYPE "ImportType" ADD VALUE 'DESIGN_QUESTIONS';

-- AlterTable
ALTER TABLE "user_stats" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "marketing_opt_in" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "interview_types" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "audience" "InterviewAudience" NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "price_setting" TEXT NOT NULL,
    "rubric" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "interview_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviewers" (
    "user_id" TEXT NOT NULL,
    "status" "InterviewerStatus" NOT NULL DEFAULT 'APPLIED',
    "headline" TEXT NOT NULL,
    "current_company" TEXT NOT NULL,
    "current_role" TEXT NOT NULL,
    "years_experience" INTEGER NOT NULL,
    "past_companies" TEXT[],
    "languages" TEXT[],
    "linkedin_url" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "buffer_min" INTEGER NOT NULL DEFAULT 15,
    "rating_sum" INTEGER NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "no_shows" INTEGER NOT NULL DEFAULT 0,
    "flagged_at" TIMESTAMP(3),
    "review_note" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviewers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" TEXT NOT NULL,
    "interviewer_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_blocks" (
    "id" TEXT NOT NULL,
    "interviewer_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "interviewer_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "company_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
    "hold_expires_at" TIMESTAMP(3),
    "candidate_notes" TEXT,
    "meeting_provider" TEXT,
    "meeting_id" TEXT,
    "meet_url" TEXT,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecards" (
    "booking_id" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "strengths" TEXT NOT NULL,
    "improvements" TEXT NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "recommended_topics" TEXT[],
    "submitted_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "interviewer_ratings" (
    "booking_id" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interviewer_ratings_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "payout_entries" (
    "id" TEXT NOT NULL,
    "interviewer_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "payout_id" TEXT,
    "kind" "LedgerKind" NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "interviewer_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "reference" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "product_ref" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "list_paise" INTEGER NOT NULL,
    "discount_paise" INTEGER NOT NULL DEFAULT 0,
    "total_paise" INTEGER NOT NULL,
    "coupon_id" TEXT,
    "referral_code_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "invoice_no" TEXT,
    "failure_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_paise" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "EntitlementKind" NOT NULL,
    "company_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "order_id" TEXT,
    "granted_by_id" TEXT,
    "note" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_credits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'AVAILABLE',
    "booking_id" TEXT,
    "order_id" TEXT,
    "granted_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "interview_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percent_off" INTEGER,
    "amount_off_paise" INTEGER,
    "kinds" "ProductKind"[],
    "max_redemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "valid_until" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "transport" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_tracks" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "roadmap" TEXT NOT NULL,
    "audience" "InterviewAudience" NOT NULL DEFAULT 'EXPERIENCED',
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "interview_types" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_questions" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "DesignKind" NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "prompt" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "tradeoffs" TEXT NOT NULL,
    "follow_ups" TEXT,
    "companies" TEXT[],
    "tracks" TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "import_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "profile_type" "ProfileType" NOT NULL,
    "years_experience" INTEGER,
    "year" INTEGER NOT NULL,
    "rounds" TEXT NOT NULL,
    "questions" TEXT NOT NULL,
    "tips" TEXT,
    "result" "ExperienceResult" NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" "ExperienceStatus" NOT NULL DEFAULT 'PENDING',
    "moderator_note" TEXT,
    "moderated_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_InterviewTypeToInterviewer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InterviewTypeToInterviewer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_RoleTrackToTopic" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RoleTrackToTopic_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_types_slug_key" ON "interview_types"("slug");

-- CreateIndex
CREATE INDEX "interviewers_status_idx" ON "interviewers"("status");

-- CreateIndex
CREATE INDEX "availability_rules_interviewer_id_idx" ON "availability_rules"("interviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_blocks_interviewer_id_date_key" ON "availability_blocks"("interviewer_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_order_id_key" ON "bookings"("order_id");

-- CreateIndex
CREATE INDEX "bookings_interviewer_id_starts_at_idx" ON "bookings"("interviewer_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_candidate_id_starts_at_idx" ON "bookings"("candidate_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_status_starts_at_idx" ON "bookings"("status", "starts_at");

-- CreateIndex
CREATE INDEX "payout_entries_interviewer_id_created_at_idx" ON "payout_entries"("interviewer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_entries_booking_id_kind_key" ON "payout_entries"("booking_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "orders_provider_order_id_key" ON "orders"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_provider_payment_id_key" ON "orders"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_invoice_no_key" ON "orders"("invoice_no");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "entitlements_user_id_ends_at_idx" ON "entitlements"("user_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "interview_credits_booking_id_key" ON "interview_credits"("booking_id");

-- CreateIndex
CREATE INDEX "interview_credits_user_id_type_id_status_idx" ON "interview_credits"("user_id", "type_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "role_tracks_slug_key" ON "role_tracks"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "design_questions_external_id_key" ON "design_questions"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_questions_slug_key" ON "design_questions"("slug");

-- CreateIndex
CREATE INDEX "design_questions_status_kind_idx" ON "design_questions"("status", "kind");

-- CreateIndex
CREATE INDEX "experiences_company_id_status_year_idx" ON "experiences"("company_id", "status", "year");

-- CreateIndex
CREATE INDEX "experiences_status_created_at_idx" ON "experiences"("status", "created_at");

-- CreateIndex
CREATE INDEX "_InterviewTypeToInterviewer_B_index" ON "_InterviewTypeToInterviewer"("B");

-- CreateIndex
CREATE INDEX "_RoleTrackToTopic_B_index" ON "_RoleTrackToTopic"("B");

-- AddForeignKey
ALTER TABLE "interviewers" ADD CONSTRAINT "interviewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "interview_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviewer_ratings" ADD CONSTRAINT "interviewer_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_entries" ADD CONSTRAINT "payout_entries_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_entries" ADD CONSTRAINT "payout_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_entries" ADD CONSTRAINT "payout_entries_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_credits" ADD CONSTRAINT "interview_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_credits" ADD CONSTRAINT "interview_credits_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "interview_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_credits" ADD CONSTRAINT "interview_credits_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_credits" ADD CONSTRAINT "interview_credits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InterviewTypeToInterviewer" ADD CONSTRAINT "_InterviewTypeToInterviewer_A_fkey" FOREIGN KEY ("A") REFERENCES "interview_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InterviewTypeToInterviewer" ADD CONSTRAINT "_InterviewTypeToInterviewer_B_fkey" FOREIGN KEY ("B") REFERENCES "interviewers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleTrackToTopic" ADD CONSTRAINT "_RoleTrackToTopic_A_fkey" FOREIGN KEY ("A") REFERENCES "role_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleTrackToTopic" ADD CONSTRAINT "_RoleTrackToTopic_B_fkey" FOREIGN KEY ("B") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No two active bookings of one interviewer may overlap (D-039). The booking service also locks
-- the interviewer row and checks; this is the safety net. Expired holds are marked EXPIRED first.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("interviewer_id" WITH =, tsrange("starts_at", "ends_at") WITH &&)
  WHERE ("status" IN ('HELD', 'CONFIRMED', 'COMPLETED'));
