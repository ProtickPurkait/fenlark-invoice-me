import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { TeamManager } from "@/components/settings/team";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Team" };

export default async function TeamSettingsPage() {
  const user = await requireUser();
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  return (
    <TeamManager
      currentUserId={user.id}
      canManage={can(user.role, "users:manage")}
      members={rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      }))}
    />
  );
}
