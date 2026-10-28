import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { BlueprintEditor, EMPTY_BLUEPRINT } from "@/app/admin/tests/blueprint-editor";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";
import { draftFromCompany, getBlueprintOptions } from "@/server/services/blueprints";

export const metadata: Metadata = { title: "New mock test" };

export default function NewTestPage({ searchParams }: PageProps<"/admin/tests/new">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/tests">
          <ArrowLeft /> Mock tests
        </Link>
      </Button>
      <PageHeader
        title="New mock test"
        description="Saved as a draft. Publish it once there are enough questions to draw from."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Editor({
  searchParams,
}: {
  searchParams: PageProps<"/admin/tests/new">["searchParams"];
}) {
  await requirePermission("content.edit");
  const { company } = await searchParams;
  const [options, draft] = await Promise.all([
    getBlueprintOptions(),
    typeof company === "string" ? draftFromCompany(company) : null,
  ]);
  return (
    <BlueprintEditor
      initial={draft && draft.sections.length ? draft : EMPTY_BLUEPRINT}
      options={options}
    />
  );
}
