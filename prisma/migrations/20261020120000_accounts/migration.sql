-- CreateEnum
CREATE TYPE "CodePurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'PHONE_LOGIN');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'SMS';

-- CreateTable
CREATE TABLE "password_credentials" (
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "method" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "purpose" "CodePurpose" NOT NULL,
    "target" TEXT NOT NULL,
    "user_id" TEXT,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "verification_codes_purpose_target_created_at_idx" ON "verification_codes"("purpose", "target", "created_at");

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
