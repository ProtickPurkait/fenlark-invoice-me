"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createElement } from "react";
import { z } from "zod";
import { logActivity, userActor } from "@/lib/activity";
import { requestLogin } from "@/lib/auth/service";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { deleteUserSessions } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { businessSettings, numberCounters, numberSeries, users } from "@/lib/db/schema";
import { todayIST } from "@/lib/dates";
import { sendEmail } from "@/lib/email/send";
import { runAction, UserError, type ActionResult } from "@/lib/errors";
import { counterPeriod } from "@/lib/numbering";
import { businessName, emailBrand, loadSettings } from "@/lib/settings";
import { putFile, sniffImageType } from "@/lib/storage";
import { randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import {
  businessProfileSchema,
  invoiceDefaultsSchema,
  inviteSchema,
  paymentDetailsSchema,
  remindersSchema,
  seriesSchema,
  type BusinessProfileInput,
  type InviteInput,
  type InvoiceDefaultsInput,
  type PaymentDetailsInput,
  type RemindersInput,
  type SeriesInput,
} from "@/lib/validation/settings";
import { BrandedEmail } from "@/emails/branded-email";

function refresh() {
  revalidatePath("/", "layout");
}

async function updateSettings(values: Partial<typeof businessSettings.$inferInsert>, section: string) {
  const user = await requirePermission("settings:write");
  await loadSettings(); // ensure the row exists
  await db.update(businessSettings).set(values).where(eq(businessSettings.id, 1));
  await logActivity(userActor(user), {
    entityType: "settings",
    action: "update",
    summary: `Updated ${section} settings`,
    data: { fields: Object.keys(values) },
  });
  refresh();
}

export async function saveBusinessProfile(input: BusinessProfileInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    await updateSettings(businessProfileSchema.parse(input), "business profile");
    return null;
  }, "Business profile saved");
}

export async function savePaymentDetails(input: PaymentDetailsInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    await updateSettings(paymentDetailsSchema.parse(input), "payment details");
    return null;
  }, "Payment details saved");
}

export async function saveInvoiceDefaults(input: InvoiceDefaultsInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    await updateSettings(invoiceDefaultsSchema.parse(input), "invoice defaults");
    return null;
  }, "Defaults saved");
}

export async function saveReminders(input: RemindersInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    await updateSettings(remindersSchema.parse(input), "reminder");
    return null;
  }, "Reminder settings saved");
}

export async function saveSeries(input: SeriesInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const v = seriesSchema.parse(input);
    await db.transaction(async (tx) => {
      await tx
        .insert(numberSeries)
        .values({ docType: v.docType, prefix: v.prefix, pattern: v.pattern, padding: v.padding, resetYearly: v.resetYearly })
        .onConflictDoUpdate({
          target: numberSeries.docType,
          set: { prefix: v.prefix, pattern: v.pattern, padding: v.padding, resetYearly: v.resetYearly },
        });
      if (v.nextNumber) {
        const period = counterPeriod(todayIST(), v.resetYearly);
        const [current] = await tx
          .select()
          .from(numberCounters)
          .where(and(eq(numberCounters.docType, v.docType), eq(numberCounters.period, period)))
          .for("update");
        const lastValue = v.nextNumber - 1;
        if (current && current.lastValue > lastValue) {
          throw new UserError(
            `Numbers up to ${current.lastValue} are already used this period; the next number must be at least ${current.lastValue + 1}.`,
            { nextNumber: `Must be at least ${current.lastValue + 1}` },
          );
        }
        await tx
          .insert(numberCounters)
          .values({ docType: v.docType, period, lastValue })
          .onConflictDoUpdate({ target: [numberCounters.docType, numberCounters.period], set: { lastValue } });
      }
      await logActivity(
        userActor(user),
        { entityType: "settings", action: "update", summary: `Updated ${v.docType.replace("_", " ")} numbering`, data: v },
        tx,
      );
    });
    refresh();
    return null;
  }, "Numbering saved");
}

const MAX_IMAGE_BYTES = 1024 * 1024;

export async function uploadBrandImage(formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const kind = z.enum(["logo", "signature"]).parse(formData.get("kind"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose an image to upload");
    if (file.size > MAX_IMAGE_BYTES) throw new UserError("Image must be under 1 MB");
    const data = Buffer.from(await file.arrayBuffer());
    const type = sniffImageType(data);
    if (!type) throw new UserError("Upload a PNG or JPEG image");

    const key = `brand/${kind}-${randomToken(8)}${type === "image/png" ? ".png" : ".jpg"}`;
    await putFile(key, data, type);
    await loadSettings();
    // Previous files are kept: issued documents' snapshots still point at them.
    await db
      .update(businessSettings)
      .set(kind === "logo" ? { logoPath: key } : { signaturePath: key })
      .where(eq(businessSettings.id, 1));
    await logActivity(userActor(user), { entityType: "settings", action: "upload", summary: `Uploaded a new ${kind}` });
    refresh();
    return null;
  }, "Image uploaded");
}

export async function removeBrandImage(kind: "logo" | "signature"): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const which = z.enum(["logo", "signature"]).parse(kind);
    await db
      .update(businessSettings)
      .set(which === "logo" ? { logoPath: null } : { signaturePath: null })
      .where(eq(businessSettings.id, 1));
    await logActivity(userActor(user), { entityType: "settings", action: "remove", summary: `Removed the ${which}` });
    refresh();
    return null;
  }, "Image removed");
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function inviteUser(input: InviteInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const actor = await requirePermission("users:manage");
    const v = inviteSchema.parse(input);
    const [existing] = await db.select().from(users).where(eq(users.email, v.email));
    if (existing) throw new UserError("That person already has an account.", { email: "Already a user" });
    const [created] = await db
      .insert(users)
      .values({ email: v.email, name: v.name, role: v.role, invitedBy: actor.id })
      .returning();

    const settings = await loadSettings();
    const name = businessName(settings);
    await sendEmail({
      kind: "invite",
      to: [v.email],
      replyTo: actor.email,
      subject: `You've been invited to ${name} billing`,
      createdBy: actor.id,
      react: createElement(BrandedEmail, {
        brand: emailBrand(settings),
        preview: `${actor.name || actor.email} invited you to ${name} billing`,
        message: `${actor.name || actor.email} has invited you to ${name} billing as ${v.role === "admin" ? "an admin" : `a ${v.role}`}.\n\nSign in with this email address — we'll send you a one-time code each time. No password needed.`,
        cta: { label: "Sign in", url: appUrl("/login") },
      }),
    });
    await logActivity(userActor(actor), {
      entityType: "user",
      entityId: created.id,
      action: "invite",
      summary: `Invited ${v.email} as ${v.role}`,
    });
    refresh();
    return null;
  }, "Invitation sent");
}

export async function updateUser(input: { userId: string; role?: "admin" | "staff" | "viewer"; active?: boolean; name?: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const actor = await requirePermission("users:manage");
    const v = z
      .object({
        userId: z.uuid(),
        role: z.enum(["admin", "staff", "viewer"]).optional(),
        active: z.boolean().optional(),
        name: z.string().trim().max(120).optional(),
      })
      .parse(input);
    const [target] = await db.select().from(users).where(eq(users.id, v.userId));
    if (!target) throw new UserError("User not found");
    if (target.role === "owner" && (v.role || v.active === false)) throw new UserError("The owner's access can't be changed.");
    if (target.id === actor.id && v.active === false) throw new UserError("You can't deactivate yourself.");
    if (target.role === "admin" && actor.role !== "owner" && (v.role || v.active === false)) {
      throw new UserError("Only the owner can change another admin.");
    }
    await db
      .update(users)
      .set({
        ...(v.role ? { role: v.role } : {}),
        ...(v.active !== undefined ? { active: v.active } : {}),
        ...(v.name !== undefined ? { name: v.name } : {}),
      })
      .where(eq(users.id, v.userId));
    if (v.active === false) await deleteUserSessions(v.userId);
    const changes = [v.role ? `role → ${v.role}` : null, v.active === false ? "deactivated" : v.active ? "reactivated" : null]
      .filter(Boolean)
      .join(", ");
    await logActivity(userActor(actor), {
      entityType: "user",
      entityId: v.userId,
      action: "update",
      summary: `Updated ${target.email}${changes ? ` (${changes})` : ""}`,
    });
    refresh();
    return null;
  }, "User updated");
}

export async function updateOwnName(name: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser();
    const value = z.string().trim().max(120).parse(name);
    await db.update(users).set({ name: value }).where(eq(users.id, user.id));
    refresh();
    return null;
  }, "Name saved");
}

export async function sendTestEmail(): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const settings = await loadSettings();
    const result = await sendEmail({
      kind: "test",
      to: [user.email],
      subject: `Test email from ${businessName(settings)} billing`,
      createdBy: user.id,
      react: createElement(BrandedEmail, {
        brand: emailBrand(settings),
        preview: "Your email settings work",
        message: "This is a test email. If you can read it, sending works and your branding looks like this.",
      }),
    });
    if (result.status === "failed") throw new UserError(`Sending failed: ${result.error}`);
    return { status: result.status };
  });
}

export async function resendInvite(userId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requirePermission("users:manage");
    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, z.uuid().parse(userId)), ne(users.role, "owner")));
    if (!target || !target.active) throw new UserError("User not found or inactive");
    const result = await requestLogin({ email: target.email, audience: "staff" });
    if (!result.ok) throw new UserError(result.error);
    return null;
  }, "Sign-in link sent");
}
