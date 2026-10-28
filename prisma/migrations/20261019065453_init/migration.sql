-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'INTERVIEWER', 'SUPER_ADMIN', 'CONTENT_AUTHOR', 'REVIEWER', 'OPS_ADMIN', 'SUPPORT_ADMIN');

-- CreateEnum
CREATE TYPE "ProfileType" AS ENUM ('FRESHER', 'EXPERIENCED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone_number" TEXT,
    "phone_number_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "roles" "Role"[] DEFAULT ARRAY['STUDENT']::"Role"[],
    "profile_type" "ProfileType",
    "onboarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fresher_profiles" (
    "user_id" TEXT NOT NULL,
    "college" TEXT,
    "degree" TEXT,
    "branch" TEXT,
    "grad_year" INTEGER,
    "cgpa_band" TEXT,
    "has_backlogs" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fresher_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "experienced_profiles" (
    "user_id" TEXT NOT NULL,
    "current_role" TEXT,
    "years_experience" INTEGER,
    "current_company" TEXT,
    "tech_stack" TEXT[],
    "target_roles" TEXT[],

    CONSTRAINT "experienced_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "fresher_profiles" ADD CONSTRAINT "fresher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experienced_profiles" ADD CONSTRAINT "experienced_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
