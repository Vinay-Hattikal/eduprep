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
import { listDsaTopics } from "@/server/services/problems";

export const metadata: Metadata = { title: "New coding problem" };

export default function NewProblemPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/problems">
          <ArrowLeft /> Coding problems
        </Link>
      </Button>
      <PageHeader
        title="New coding problem"
        description="Saved as a draft. Then add tests and a reference solution on the problem's page."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewProblem />
      </Suspense>
    </div>
  );
}

async function NewProblem() {
  await requirePermission("content.edit");
  return (
    <Card>
      <CardContent>
        <ProblemForm values={EMPTY_PROBLEM} topics={await listDsaTopics()} />
      </CardContent>
    </Card>
  );
}
