import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { LoginAudience, User } from "@/lib/db/schema";
import { can, type Permission } from "./roles";
import { createSession, deleteSession, lookupSession, type SessionInfo } from "./service";

export const STAFF_COOKIE = "fl_session";
export const PORTAL_COOKIE = "fl_portal";

function cookieName(audience: LoginAudience): string {
  return audience === "staff" ? STAFF_COOKIE : PORTAL_COOKIE;
}

const getSession = cache(async (audience: LoginAudience): Promise<SessionInfo | null> => {
  const token = (await cookies()).get(cookieName(audience))?.value;
  if (!token) return null;
  return lookupSession(token, audience);
});

export async function getCurrentUser(): Promise<User | null> {
  return (await getSession("staff"))?.user ?? null;
}

/** For pages and actions: redirects to /login when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`You don't have permission to do this (${permission}).`);
    this.name = "PermissionError";
  }
}

/** For server actions: throws when the signed-in user lacks a permission. */
export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw new PermissionError(permission);
  return user;
}

export async function getPortalEmail(): Promise<string | null> {
  return (await getSession("portal"))?.email ?? null;
}

export async function requirePortalEmail(): Promise<string> {
  const email = await getPortalEmail();
  if (!email) redirect("/portal/login");
  return email;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function startSession(audience: LoginAudience, email: string, userId: string | null): Promise<void> {
  const h = await headers();
  const session = await createSession({
    audience,
    email,
    userId,
    userAgent: h.get("user-agent"),
    ip: await clientIp(),
  });
  (await cookies()).set(cookieName(audience), session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function endSession(audience: LoginAudience): Promise<void> {
  const jar = await cookies();
  const token = jar.get(cookieName(audience))?.value;
  if (token) await deleteSession(token);
  jar.delete(cookieName(audience));
}
