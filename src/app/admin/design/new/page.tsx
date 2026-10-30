import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DesignKind } from "@/generated/prisma/enums";
import { ArrowLeft } from "lucide-react";
import { DesignForm } from "@/app/admin/design/design-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { companyTabHref } from "@/lib/content/companies";
import { requirePermission } from "@/server/auth";
import { designFormOptions } from "@/server/services/design-questions";

export const metadata: Metadata = { title: "New design question" };

export default function NewDesignQuestionPage({ searchParams }: PageProps<"/admin/design/new">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <NewDesignQuestion searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const KINDS = Object.values(DesignKind);

/**
 * A blank design or interview question. From a company's Interview questions tab (D-067):
 * `?company=<slug>` tags it with that company and `?kind=TECHNICAL|HR` picks the kind.
 */
async function NewDesignQuestion({
  searchParams,
}: {
  searchParams: PageProps<"/admin/design/new">["searchParams"];
}) {
  await requirePermission("content.edit");
  const query = await searchParams;
  const { tracks, companies } = await designFormOptions();
  const company = companies.find((c) => c.slug === query.company);
  const kind = KINDS.find((k) => k === query.kind) ?? "SYSTEM_DESIGN";
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 max-w-full">
        <Link href={company ? companyTabHref(company.slug, "interview") : "/admin/design"}>
          <ArrowLeft />
          <span className="truncate">
            {company ? `${company.name} interview questions` : "Design questions"}
          </span>
        </Link>
      </Button>
      <PageHeader
        title={company ? `New interview question for ${company.name}` : "New design question"}
        description="Saved as a draft."
      />
      <Card>
        <CardContent>
          <DesignForm
            canEdit
            tracks={tracks}
            values={{
              externalId: "",
              slug: "",
              kind,
              title: "",
              difficulty: "MEDIUM",
              prompt: "",
              requirements: "",
              approach: "",
              tradeoffs: "",
              followUps: "",
              companies: company ? [company.slug] : [],
              tracks: [],
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
