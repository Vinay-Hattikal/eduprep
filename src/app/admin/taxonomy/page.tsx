import type { Metadata } from "next";
import { Suspense } from "react";
import { FolderTree } from "lucide-react";
import { NodeCreateForm, NodeEditForm } from "@/app/admin/taxonomy/taxonomy-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { getTaxonomyAdmin } from "@/server/services/taxonomy";

export const metadata: Metadata = { title: "Taxonomy" };

export default function TaxonomyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Taxonomy"
        description="Subjects, topics and subtopics. Rename and reorder here; slugs never change because import files refer to them."
      />
      <Suspense fallback={<PageSkeleton />}>
        <TaxonomyTree />
      </Suspense>
    </div>
  );
}

async function TaxonomyTree() {
  const user = await requirePermission("content.view");
  const canEdit = can(user.roles, "taxonomy.manage");
  const subjects = await getTaxonomyAdmin();

  return (
    <div className="space-y-4">
      {canEdit ? (
        <Card>
          <CardContent>
            <NodeCreateForm level="subject" label="Subject" />
          </CardContent>
        </Card>
      ) : null}

      {subjects.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No subjects yet"
          description="Import taxonomy.csv on the Imports page, or add subjects one by one."
        />
      ) : null}

      {subjects.map((subject) => (
        <Card key={subject.id}>
          <CardHeader className="flex flex-row flex-wrap items-center gap-3 border-b">
            <NodeEditForm
              level="subject"
              id={subject.id}
              slug={subject.slug}
              name={subject.name}
              order={subject.order}
              canEdit={canEdit}
            />
            <Badge variant="secondary" className="tabular">
              {subject._count.questions} questions
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1">
            {subject.topics.map((topic) => (
              <details key={topic.id} className="group rounded-lg border-b last:border-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span
                    className="text-muted-foreground transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                  <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {topic._count.questions} q · {topic.subtopics.length} subtopics
                  </span>
                </summary>
                <div className="space-y-2 pb-3 pl-6">
                  <NodeEditForm
                    level="topic"
                    id={topic.id}
                    slug={topic.slug}
                    name={topic.name}
                    order={topic.order}
                    canEdit={canEdit}
                  />
                  {topic.subtopics.map((subtopic) => (
                    <div key={subtopic.id} className="flex items-center gap-2 pl-4">
                      <NodeEditForm
                        level="subtopic"
                        id={subtopic.id}
                        slug={subtopic.slug}
                        name={subtopic.name}
                        order={subtopic.order}
                        canEdit={canEdit}
                      />
                      <span className="tabular text-xs text-muted-foreground">
                        {subtopic._count.questions} q
                      </span>
                    </div>
                  ))}
                  {canEdit ? (
                    <div className="pl-4">
                      <NodeCreateForm level="subtopic" parentId={topic.id} label="Subtopic" />
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
            {canEdit ? (
              <div className="pt-3">
                <NodeCreateForm level="topic" parentId={subject.id} label="Topic" />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
