import Link from "next/link";
import { Wand2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/server/db";

/** The company's mock tests, and a shortcut to draft one from its test sections. */
export async function CompanyMocks({
  company,
  hasTestSections,
}: {
  company: { id: string; name: string; slug: string };
  hasTestSections: boolean;
}) {
  const mocks = await db.testBlueprint.findMany({
    where: { companyId: company.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      _count: { select: { sections: true, sittings: true } },
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>
            <h2>Mock tests</h2>
          </CardTitle>
          <CardDescription>
            {hasTestSections
              ? `Draft a mock that copies ${company.name}'s test sections, timers, negative marking and topics.`
              : "Add the online-test rounds and their sections on the Hiring process tab first."}
          </CardDescription>
        </div>
        {hasTestSections ? (
          <Button asChild>
            <Link href={`/admin/tests/new?company=${company.id}`}>
              <Wand2 /> Draft mock from the pattern
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {mocks.length ? (
          <ul className="divide-y rounded-lg border">
            {mocks.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <Link
                  href={`/admin/tests/${m.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {m.title}
                </Link>
                <span className="text-muted-foreground">
                  {m._count.sections} sections · {m._count.sittings} attempts
                </span>
                <span className="ml-auto">
                  <ContentStatusBadge status={m.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No mock tests yet" />
        )}
      </CardContent>
    </Card>
  );
}
