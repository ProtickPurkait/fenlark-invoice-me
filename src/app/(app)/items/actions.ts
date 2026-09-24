"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity, userActor } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { runAction, UserError, type ActionResult } from "@/lib/errors";
import { itemSchema, type ItemInput } from "@/lib/validation/catalog";

export async function saveItem(id: string | null, input: ItemInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const values = itemSchema.parse(input);
    let itemId: string;
    if (id) {
      const [row] = await db.update(items).set(values).where(eq(items.id, z.uuid().parse(id))).returning({ id: items.id });
      if (!row) throw new UserError("Item not found");
      itemId = row.id;
    } else {
      const [row] = await db.insert(items).values(values).returning({ id: items.id });
      itemId = row.id;
    }
    await logActivity(userActor(user), { entityType: "item", entityId: itemId, action: id ? "update" : "create", summary: `${id ? "Updated" : "Added"} item ${values.name}` });
    revalidatePath("/items");
    return { id: itemId };
  }, "Item saved");
}

export async function setItemArchived(id: string, archived: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const [row] = await db
      .update(items)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(items.id, z.uuid().parse(id)))
      .returning({ name: items.name });
    if (!row) throw new UserError("Item not found");
    await logActivity(userActor(user), { entityType: "item", entityId: id, action: archived ? "archive" : "restore", summary: `${archived ? "Archived" : "Restored"} item ${row.name}` });
    revalidatePath("/items");
    return null;
  }, archived ? "Item archived" : "Item restored");
}
