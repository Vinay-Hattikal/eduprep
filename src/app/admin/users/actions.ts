"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminAccessSchema } from "@/schemas/admin-content";
import { requirePermission } from "@/server/auth";
import {
  grantAccess,
  refundOrder,
  revokeEntitlement,
  type Grant,
} from "@/server/services/commerce";
import { setAdminAccess } from "@/server/services/user-roles";

const id = z.string().min(1).max(40);
const back = (userId: string, query: string) => redirect(`/admin/users/${userId}?${query}`);

export async function grantAction(formData: FormData) {
  const actor = await requirePermission("users.grant");
  const userId = id.parse(formData.get("userId"));
  const kind = z.enum(["PRO", "COMPANY_PACK", "CREDITS"]).parse(formData.get("kind"));
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 200);
  if (!note) back(userId, `error=${encodeURIComponent("Add a note: why is access granted?")}`);
  const amount = Number(formData.get("amount"));
  if (!Number.isInteger(amount) || amount < 1 || amount > 366)
    back(userId, `error=${encodeURIComponent("Enter a number from 1 to 366.")}`);
  let grant: Grant;
  if (kind === "PRO") grant = { kind, days: amount };
  else if (kind === "COMPANY_PACK")
    grant = { kind, days: amount, companyId: id.parse(formData.get("companyId")) };
  else grant = { kind, quantity: Math.min(amount, 10), typeId: id.parse(formData.get("typeId")) };
  await grantAccess(userId, grant, actor, note);
  revalidatePath(`/admin/users/${userId}`);
  back(userId, "done=granted");
}

export async function refundAction(formData: FormData) {
  const actor = await requirePermission("payments.refund");
  const userId = id.parse(formData.get("userId"));
  const result = await refundOrder(
    id.parse(formData.get("orderId")),
    actor,
    String(formData.get("reason") ?? "").slice(0, 200) || "Support refund",
  );
  revalidatePath(`/admin/users/${userId}`);
  back(userId, result.ok ? "done=refunded" : `error=${encodeURIComponent(result.error)}`);
}

export async function revokeAction(formData: FormData) {
  const actor = await requirePermission("users.grant");
  const userId = id.parse(formData.get("userId"));
  await revokeEntitlement(id.parse(formData.get("entitlementId")), actor);
  revalidatePath(`/admin/users/${userId}`);
  back(userId, "done=revoked");
}

export async function setAdminAccessAction(formData: FormData) {
  const actor = await requirePermission("users.roles");
  const parsed = adminAccessSchema.safeParse({
    userId: formData.get("userId"),
    admin: formData.get("admin"),
  });
  if (!parsed.success) redirect("/admin/users");
  const { userId, admin } = parsed.data;
  const result = await setAdminAccess(userId, admin === "on", actor);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  back(userId, result.ok ? "done=roles" : `error=${encodeURIComponent(result.error)}`);
}
