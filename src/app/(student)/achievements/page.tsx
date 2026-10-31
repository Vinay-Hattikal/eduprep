import type { Metadata } from "next";
import { Suspense } from "react";
import { Flame, Lock, Medal, Snowflake, Sparkles } from "lucide-react";
import { BuyFreezeButton } from "@/app/(student)/achievements/freeze-button";
import { ShareButton } from "@/components/engagement/share-button";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BADGE_GROUPS, BADGE_IDS, BADGES, type BadgeGroup } from "@/lib/engagement/badges";
import { SHARE_KIND_LABELS, type ShareCardData } from "@/lib/engagement/share";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { freezeRules, listBadges, markBadgesSeen } from "@/server/services/engagement";
import { getStudentStats } from "@/server/services/learning";
import { getSetting } from "@/server/services/settings";
import { listMyShareCards } from "@/server/services/share-cards";
import { RevokeShareButton } from "@/app/(student)/achievements/revoke-button";

export const metadata: Metadata = { title: "Achievements" };

export default function AchievementsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Achievements"
        description="Your streak, streak freezes and badges. Share the ones you're proud of."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Achievements />
      </Suspense>
    </div>
  );
}

const TIER_STYLES = {
  1: "bg-secondary text-secondary-foreground",
  2: "bg-primary/10 text-primary",
  3: "bg-highlight/15 text-highlight-foreground dark:text-highlight",
} as const;

async function Achievements() {
  const user = await requirePermission("student.access");
  const [stats, badges, rules, cost, shares] = await Promise.all([
    getStudentStats(user.id),
    listBadges(user.id),
    freezeRules(),
    getSetting("streak.freezePointsCost"),
    listMyShareCards(user.id),
  ]);
  await markBadgesSeen(user.id);
  const earned = new Map(badges.map((b) => [b.id, b]));
  const groups = Object.keys(BADGE_GROUPS) as BadgeGroup[];

  return (
    <div className="space-y-8">
      <section aria-labelledby="streak-heading" className="space-y-4">
        <h2 id="streak-heading" className="text-lg font-semibold">
          Streak
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Current streak"
            value={
              <span className="flex items-center gap-1.5">
                {stats.streak}
                <Flame
                  className={cn(
                    "size-5",
                    stats.streak ? "text-highlight" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
              </span>
            }
            hint={`best ${stats.longestStreak}`}
          />
          <StatCard
            label="Streak freezes"
            value={
              <span className="flex items-center gap-1.5" data-testid="freeze-count">
                {stats.streakFreezes}
                <Snowflake className="size-5 text-info" aria-hidden="true" />
              </span>
            }
            hint={`hold up to ${rules.maxFreezes}`}
          />
          <StatCard label="Points" value={stats.points.toLocaleString("en-IN")} icon={Sparkles} />
          <StatCard label="Badges" value={`${badges.length}/${BADGE_IDS.length}`} icon={Medal} />
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm">
              <p className="font-medium">How freezes work</p>
              <p className="text-muted-foreground">
                Miss a day and a freeze keeps your streak alive automatically.
                {rules.earnEvery > 0
                  ? ` You earn one every ${rules.earnEvery} days in a row.`
                  : ""}{" "}
                Earn points by sharing interview experiences and drive reports.
              </p>
              {stats.recentFreeze ? (
                <p className="text-info">
                  A freeze saved your streak on {formatDate(stats.recentFreeze)}.
                </p>
              ) : null}
            </div>
            {cost > 0 && rules.maxFreezes > 0 ? (
              <BuyFreezeButton
                cost={cost}
                disabled={stats.points < cost || stats.streakFreezes >= rules.maxFreezes}
              />
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="badges-heading" className="space-y-4">
        <h2 id="badges-heading" className="text-lg font-semibold">
          Badges
        </h2>
        {groups.map((group) => (
          <div key={group} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{BADGE_GROUPS[group]}</h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BADGE_IDS.filter((id) => BADGES[id].group === group).map((id) => {
                const badge = BADGES[id];
                const mine = earned.get(id);
                return (
                  <li
                    key={id}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border bg-card p-4",
                      !mine && "opacity-60",
                    )}
                    data-testid={mine ? "badge-earned" : "badge-locked"}
                  >
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full",
                        mine ? TIER_STYLES[badge.tier] : "bg-muted text-muted-foreground",
                      )}
                      aria-hidden="true"
                    >
                      {mine ? <Medal className="size-5" /> : <Lock className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {badge.name}
                        {mine && !mine.seen ? <Badge className="text-[0.625rem]">New</Badge> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">{badge.description}</p>
                      {mine ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-xs text-muted-foreground">
                            Earned {formatDate(mine.earnedAt)}
                          </span>
                          <ShareButton
                            kind="BADGE"
                            refId={id}
                            text={`I earned the "${badge.name}" badge: ${badge.description}`}
                            variant="ghost"
                          />
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {shares.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your shared links</h2>
            </CardTitle>
            <CardDescription>
              Anyone with one of these links can see it. Turn off any you like.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {shares.map((share) => {
                const data = share.data as unknown as ShareCardData;
                return (
                  <li key={share.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/s/${share.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {data.title}: {data.headline}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {SHARE_KIND_LABELS[share.kind]} · shared {formatDate(share.createdAt)}
                      </p>
                    </div>
                    <RevokeShareButton id={share.id} />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
