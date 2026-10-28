-- Public sample questions (D-058): answer and explanation shown without sign-in.
ALTER TABLE "questions" ADD COLUMN "public_sample" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "questions_topic_id_public_sample_idx" ON "questions"("topic_id", "public_sample");
