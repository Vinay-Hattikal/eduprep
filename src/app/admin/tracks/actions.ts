"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrors, trackFormFromData } from "@/schemas/admin-content";
import { requirePermission } from "@/server/auth";
import { saveTrack, setTrackVisible } from "@/server/services/role-tracks";

export type TrackFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveTrackAction(
  _prev: TrackFormState,
  formData: FormData,
): Promise<TrackFormState> {
  const user = await requirePermission("taxonomy.manage");
  const parsed = trackFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await saveTrack(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  revalidatePath("/admin/tracks");
  revalidatePath("/tracks");
  redirect(`/admin/tracks/${result.id}?${result.created ? "created=1" : "saved=1"}`);
}

export async function setTrackVisibleAction(formData: FormData) {
  const user = await requirePermission("taxonomy.manage");
  const id = z.string().min(1).max(40).parse(formData.get("id"));
  await setTrackVisible(id, formData.get("visible") === "yes", user);
  revalidatePath("/admin/tracks");
  revalidatePath(`/admin/tracks/${id}`);
  revalidatePath("/tracks");
}
