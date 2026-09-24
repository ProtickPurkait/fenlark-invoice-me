"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity, userActor } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { runAction, UserError, type ActionResult } from "@/lib/errors";
import { clientSchema, type ClientInput } from "@/lib/validation/catalog";

export interface SavedClient {
  id: string;
  name: string;
  email: string;
  gstin: string;
  country: string;
  stateCode: string;
  isSez: boolean;
  currency: string;
  paymentTermsDays: number | null;
}

export async function saveClient(id: string | null, input: ClientInput): Promise<ActionResult<SavedClient>> {
  return runAction(async () => {
    const user = await requirePermission("clients:write");
    const values = clientSchema.parse(input);
    let clientId: string;
    if (id) {
      const [row] = await db.update(clients).set(values).where(eq(clients.id, z.uuid().parse(id))).returning({ id: clients.id });
      if (!row) throw new UserError("Client not found");
      clientId = row.id;
      await logActivity(userActor(user), { entityType: "client", entityId: clientId, action: "update", summary: `Updated client ${values.name}` });
    } else {
      const [row] = await db.insert(clients).values(values).returning({ id: clients.id });
      clientId = row.id;
      await logActivity(userActor(user), { entityType: "client", entityId: clientId, action: "create", summary: `Added client ${values.name}` });
    }
    revalidatePath("/clients");
    return {
      id: clientId,
      name: values.name,
      email: values.email,
      gstin: values.gstin,
      country: values.country,
      stateCode: values.stateCode,
      isSez: values.isSez,
      currency: values.currency,
      paymentTermsDays: values.paymentTermsDays,
    };
  }, "Client saved");
}

export async function setClientArchived(id: string, archived: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("clients:write");
    const [row] = await db
      .update(clients)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(clients.id, z.uuid().parse(id)))
      .returning({ name: clients.name });
    if (!row) throw new UserError("Client not found");
    await logActivity(userActor(user), {
      entityType: "client",
      entityId: id,
      action: archived ? "archive" : "restore",
      summary: `${archived ? "Archived" : "Restored"} client ${row.name}`,
    });
    revalidatePath("/clients", "layout");
    return null;
  }, archived ? "Client archived" : "Client restored");
}
