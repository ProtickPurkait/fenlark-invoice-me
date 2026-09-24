"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userActor } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/session";
import { todayIST } from "@/lib/dates";
import { db } from "@/lib/db";
import { recurringProfiles } from "@/lib/db/schema";
import { runAction, UserError, type ActionResult } from "@/lib/errors";
import type { DocumentInputValues } from "@/lib/validation/document";
import { deleteProfile, runProfile, saveProfile, setProfileStatus, type ScheduleInput } from "./service";

const id = z.uuid();

export async function saveRecurringAction(
  profileId: string | null,
  input: { schedule: ScheduleInput; document: DocumentInputValues },
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const saved = await saveProfile(userActor(user), profileId ? id.parse(profileId) : null, input);
    revalidatePath("/recurring");
    return { id: saved };
  }, "Recurring schedule saved");
}

export async function setRecurringStatusAction(profileId: string, status: "active" | "paused"): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    await setProfileStatus(userActor(user), id.parse(profileId), z.enum(["active", "paused"]).parse(status));
    revalidatePath("/recurring");
    return null;
  }, status === "paused" ? "Paused" : "Resumed");
}

export async function deleteRecurringAction(profileId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    await deleteProfile(userActor(user), id.parse(profileId));
    revalidatePath("/recurring");
    return null;
  }, "Deleted");
}

/** Generate the next invoice now instead of waiting for the daily job. */
export async function runRecurringNowAction(profileId: string): Promise<ActionResult<{ documentId: string | null }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const [profile] = await db.select().from(recurringProfiles).where(eq(recurringProfiles.id, id.parse(profileId)));
    if (!profile) throw new UserError("Recurring profile not found");
    if (profile.status !== "active") throw new UserError("Resume the schedule first");
    const result = await runProfile(profile, todayIST(), userActor(user));
    if (result.error && !result.documentId) throw new UserError(result.error);
    revalidatePath("/", "layout");
    return { documentId: result.documentId ?? null };
  }, "Invoice created");
}
