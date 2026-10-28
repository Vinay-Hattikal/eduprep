import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ProblemForm } from "@/app/admin/problems/[id]/forms";
import { EMPTY_PROBLEM } from "@/app/admin/problems/problem-defaults";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { companyOptions } from "@/server/services/company-links";
import { listDsaTopics } from "@/server/services/problems";

export const metadata: Metadata = { title: "New coding problem" };

export default function NewProblemPage({ searchParams }: PageProps<"/admin/problems/new">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <NewProblem searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** A blank problem; with `?company=<slug>` it is tagged with that company (D-057). */
async function NewProblem({
  searchParams,
}: {
  searchParams: PageProps<"/admin/problems/new">["searchParams"];
}) {
  await requirePermission("content.edit");
  const { company: slug } = await searchParams;
  const [topics, companies] = await Promise.all([listDsaTopics(), companyOptions()]);
  const company = typeof slug === "string" ? companies.find((c) => c.slug === slug) : undefined;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 max-w-full">
        <Link href={company ? `/admin/companies/${company.slug}?tab=coding` : "/admin/problems"}>
          <ArrowLeft />
          <span className="truncate">{company ? `${company.name} coding` : "Coding problems"}</span>
        </Link>
      </Button>
      <PageHeader
        title={company ? `New coding problem for ${company.name}` : "New coding problem"}
        description="Saved as a draft. Then add tests and a reference solution on the problem's page."
      />
      <Card>
        <CardContent>
          <ProblemForm
            values={EMPTY_PROBLEM}
            topics={topics}
            companies={companies}
            initialCompanies={company ? [{ companyId: company.id, askedIn: "" }] : []}
          />
        </CardContent>
      </Card>
    </>
  );
}
