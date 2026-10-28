import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PostingForm } from "@/app/admin/postings/posting-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "New job posting" };

export default function NewPostingPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/postings">
          <ArrowLeft /> Job postings
        </Link>
      </Button>
      <PageHeader
        title="New job posting"
        description="Starts as a draft; publish it when it's checked."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewPosting />
      </Suspense>
    </div>
  );
}

async function NewPosting() {
  await requirePermission("postings.manage");
  const companies = await db.company.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <PostingForm
      companies={companies}
      values={{
        title: "",
        companyId: "",
        companyName: "",
        locations: "",
        workMode: "ONSITE",
        jobType: "FULL_TIME",
        audience: ["FRESHER"],
        minExperience: "0",
        maxExperience: "0",
        salary: "",
        skills: "",
        description: "",
        branches: "",
        gradYears: "",
        minCgpa: "",
        maxBacklogs: "",
        applyUrl: "",
        applyBy: "",
      }}
    />
  );
}
