import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { z } from "zod";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { createCoupon, listCoupons, setCouponActive } from "@/server/services/commerce";

export const metadata: Metadata = { title: "Coupons" };

async function createCouponAction(formData: FormData) {
  "use server";
  const actor = await requirePermission("coupons.manage");
  const off = Number(formData.get("off"));
  const unit = formData.get("unit");
  const max = Number(formData.get("maxRedemptions")) || null;
  const until = String(formData.get("validUntil") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const result = await createCoupon(
    {
      code: String(formData.get("code") ?? ""),
      description: String(formData.get("description") ?? "").trim() || null,
      percentOff: unit === "percent" && off > 0 && off <= 90 ? Math.round(off) : null,
      amountOffPaise: unit === "rupees" && off > 0 ? Math.round(off * 100) : null,
      kinds: kind ? [z.enum(["PRO", "COMPANY_PACK", "INTERVIEW_CREDITS"]).parse(kind)] : [],
      maxRedemptions: max,
      validUntil: until ? new Date(`${until}T23:59:59+05:30`) : null,
    },
    actor,
  );
  revalidatePath("/admin/coupons");
  if (!result.ok) redirect(`/admin/coupons?error=${encodeURIComponent(result.error)}`);
}

async function toggleCouponAction(formData: FormData) {
  "use server";
  const actor = await requirePermission("coupons.manage");
  await setCouponActive(
    z.string().max(40).parse(formData.get("id")),
    formData.get("active") === "yes",
    actor,
  );
  revalidatePath("/admin/coupons");
}

export default function CouponsPage({ searchParams }: PageProps<"/admin/coupons">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes for campaigns and partners. Referral codes are automatic per user."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <Coupons searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Coupons({
  searchParams,
}: {
  searchParams: PageProps<"/admin/coupons">["searchParams"];
}) {
  await requirePermission("coupons.manage");
  const { error } = await searchParams;
  const coupons = await listCoupons();
  return (
    <div className="space-y-6">
      {typeof error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>New coupon</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCouponAction} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                name="code"
                required
                className="font-mono uppercase"
                maxLength={30}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="off">Discount</Label>
              <div className="flex gap-1">
                <Input id="off" name="off" type="number" min={1} required className="w-20" />
                <NativeSelect name="unit" aria-label="Unit" defaultValue="percent">
                  <NativeSelectOption value="percent">%</NativeSelectOption>
                  <NativeSelectOption value="rupees">₹</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kind">For</Label>
              <NativeSelect id="kind" name="kind" className="w-full" defaultValue="">
                <NativeSelectOption value="">Everything</NativeSelectOption>
                <NativeSelectOption value="PRO">Pro</NativeSelectOption>
                <NativeSelectOption value="COMPANY_PACK">Company packs</NativeSelectOption>
                <NativeSelectOption value="INTERVIEW_CREDITS">Interviews</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxRedemptions">Max uses</Label>
              <Input id="maxRedemptions" name="maxRedemptions" type="number" min={1} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validUntil">Valid until</Label>
              <Input id="validUntil" name="validUntil" type="date" />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
              <Label htmlFor="description">Description (internal)</Label>
              <Input id="description" name="description" maxLength={200} />
            </div>
            <div className="flex items-end">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <DataTable
        caption="Coupons"
        rows={coupons}
        rowKey={(c) => c.id}
        emptyTitle="No coupons yet"
        columns={[
          {
            key: "code",
            header: "Code",
            cell: (c) => <span className="font-mono font-medium">{c.code}</span>,
          },
          {
            key: "off",
            header: "Discount",
            cell: (c) => (c.percentOff ? `${c.percentOff}%` : formatRupees(c.amountOffPaise ?? 0)),
          },
          {
            key: "for",
            header: "For",
            hideOnMobile: true,
            cell: (c) => (c.kinds.length ? c.kinds.join(", ").toLowerCase() : "everything"),
          },
          {
            key: "used",
            header: "Used",
            cell: (c) => `${c.redemptions}${c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}`,
          },
          {
            key: "until",
            header: "Until",
            hideOnMobile: true,
            cell: (c) => (c.validUntil ? formatDate(c.validUntil) : "—"),
          },
          {
            key: "active",
            header: "",
            cell: (c) => (
              <form action={toggleCouponAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="active" value={c.active ? "no" : "yes"} />
                {c.active ? (
                  <Badge variant="secondary">active</Badge>
                ) : (
                  <Badge variant="outline">off</Badge>
                )}
                <Button type="submit" size="sm" variant="ghost">
                  {c.active ? "Turn off" : "Turn on"}
                </Button>
              </form>
            ),
          },
        ]}
      />
    </div>
  );
}
