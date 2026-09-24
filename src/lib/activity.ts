import "server-only";
import { activityLog, type ActorType } from "@/lib/db/schema";
import { db, type DbOrTx } from "@/lib/db";

export interface Actor {
  type: ActorType;
  id: string | null;
  label: string;
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null, label: "System" };

export function userActor(user: { id: string; name: string; email: string }): Actor {
  return { type: "user", id: user.id, label: user.name || user.email };
}

export interface ActivityInput {
  entityType: "document" | "client" | "item" | "payment" | "settings" | "user" | "recurring" | "gateway";
  entityId?: string | null;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
}

export async function logActivity(actor: Actor, input: ActivityInput, conn: DbOrTx = db): Promise<void> {
  await conn.insert(activityLog).values({
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    summary: input.summary,
    data: input.data ?? null,
  });
}
