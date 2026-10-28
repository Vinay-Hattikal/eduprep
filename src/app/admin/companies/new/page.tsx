import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CompanyForm } from "@/app/admin/companies/company-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "New company" };

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/companies">
          <ArrowLeft /> Companies
        </Link>
      </Button>
      <PageHeader
        title="New company"
        description="Starts as a draft. Add rounds, sections and sources with Imports."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewCompany />
      </Suspense>
    </div>
  );
}

async function NewCompany() {
  await requirePermission("companies.manage");
  return (
    <CompanyForm
      canEdit
      values={{
        slug: "",
        name: "",
        level: "STANDARD",
        category: "SERVICE",
        hiringFor: ["FRESHER"],
        overview: "",
        website: "",
        careersUrl: "",
        ctcFresher: "",
        ctcExperienced: "",
        minCgpa: "",
        min10thPercent: "",
        min12thPercent: "",
        maxBacklogs: "",
        maxGapYears: "",
        branches: "",
        gradYears: "",
        lastVerifiedAt: "",
      }}
    />
  );
}
