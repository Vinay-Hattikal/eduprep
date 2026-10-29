-- Job alerts and contest reminders (D-059): students can turn them off.
ALTER TABLE "users" ADD COLUMN "alerts_opt_in" BOOLEAN NOT NULL DEFAULT true;
