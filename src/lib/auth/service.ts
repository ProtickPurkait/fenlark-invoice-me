import "server-only";
import { and, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { createElement } from "react";
import { db } from "@/lib/db";
import { clients, loginTokens, sessions, users, type LoginAudience, type User } from "@/lib/db/schema";
import { randomCode, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { appUrl, env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { emailBrand, loadSettings, businessName } from "@/lib/settings";
import { BrandedEmail } from "@/emails/branded-email";
import { logActivity } from "@/lib/activity";

export const LOGIN_TOKEN_TTL_MINUTES = 15;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_REQUESTS_PER_WINDOW = 5;
export const STAFF_SESSION_DAYS = 30;
export const PORTAL_SESSION_DAYS = 7;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function codeHash(tokenId: string, code: string): string {
  return sha256(`${tokenId}:${code}`);
}

export type RequestLoginResult = { ok: true } | { ok: false; error: string };

/**
 * Starts a passwordless sign-in. Always reports success for unknown addresses
 * so the form can't be used to discover who has an account.
 */
export async function requestLogin(input: {
  email: string;
  audience: LoginAudience;
  redirectTo?: string | null;
}): Promise<RequestLoginResult> {
  const email = normalizeEmail(input.email);
  const since = new Date(Date.now() - LOGIN_TOKEN_TTL_MINUTES * 60_000);

  const [{ recent }] = await db
    .select({ recent: count() })
    .from(loginTokens)
    .where(and(eq(loginTokens.email, email), eq(loginTokens.audience, input.audience), gt(loginTokens.createdAt, since)));
  if (recent >= MAX_REQUESTS_PER_WINDOW) {
    return { ok: false, error: "Too many sign-in requests. Please wait 15 minutes and try again." };
  }

  const allowed = input.audience === "staff" ? await canStaffSignIn(email) : await canPortalSignIn(email);
  if (!allowed) return { ok: true };

  const token = randomToken();
  const code = randomCode();
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60_000);
  const [row] = await db
    .insert(loginTokens)
    .values({
      audience: input.audience,
      email,
      tokenHash: sha256(token),
      codeHash: "pending",
      expiresAt,
      redirectTo: safeRedirect(input.redirectTo, input.audience),
    })
    .returning({ id: loginTokens.id });
  await db.update(loginTokens).set({ codeHash: codeHash(row.id, code) }).where(eq(loginTokens.id, row.id));

  const settings = await loadSettings();
  const brand = emailBrand(settings);
  const path = input.audience === "staff" ? "/login/verify" : "/portal/verify";
  const link = appUrl(`${path}?token=${encodeURIComponent(token)}`);
  const what = input.audience === "staff" ? `${businessName(settings)} billing` : `the ${businessName(settings)} client portal`;

  await sendEmail({
    kind: input.audience === "staff" ? "login" : "portal_login",
    to: [email],
    subject: `Your sign-in code: ${code}`,
    react: createElement(BrandedEmail, {
      brand,
      preview: `Your sign-in code is ${code}`,
      message: `Use this code to sign in to ${what}. It expires in ${LOGIN_TOKEN_TTL_MINUTES} minutes.`,
      code,
      cta: { label: "Sign in", url: link },
      footnote: "If you didn't ask to sign in, you can ignore this email.",
    }),
  });

  return { ok: true };
}

async function canStaffSignIn(email: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (user) return user.active;
  return isBootstrapOwner(email);
}

/** The very first sign-in creates the owner account (OWNER_EMAIL, or anyone in development). */
async function isBootstrapOwner(email: string): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return false;
  const owner = env().OWNER_EMAIL;
  if (owner) return normalizeEmail(owner) === email;
  return process.env.NODE_ENV !== "production";
}

export function portalEmailMatch(email: string) {
  return and(
    eq(clients.portalEnabled, true),
    isNull(clients.archivedAt),
    or(eq(clients.email, email), sql`${email} = ANY(${clients.ccEmails})`),
  );
}

async function canPortalSignIn(email: string): Promise<boolean> {
  const [row] = await db.select({ id: clients.id }).from(clients).where(portalEmailMatch(email)).limit(1);
  return Boolean(row);
}

function safeRedirect(value: string | null | undefined, audience: LoginAudience): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (audience === "portal" && !value.startsWith("/portal")) return null;
  if (audience === "staff" && (value.startsWith("/portal") || value.startsWith("/login"))) return null;
  return value;
}

export type VerifyResult =
  | { ok: true; email: string; redirectTo: string | null }
  | { ok: false; error: string };

export async function verifyLoginToken(token: string, audience: LoginAudience): Promise<VerifyResult> {
  const now = new Date();
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(loginTokens.tokenHash, sha256(token)),
        eq(loginTokens.audience, audience),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, now),
      ),
    )
    .returning();
  if (!row) return { ok: false, error: "This sign-in link has expired or was already used. Request a new one." };
  return { ok: true, email: row.email, redirectTo: row.redirectTo };
}

/** Peek without consuming (for the confirmation page, which guards against link scanners). */
export async function peekLoginToken(token: string, audience: LoginAudience): Promise<string | null> {
  const [row] = await db
    .select({ email: loginTokens.email })
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.tokenHash, sha256(token)),
        eq(loginTokens.audience, audience),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date()),
      ),
    );
  return row?.email ?? null;
}

export async function verifyLoginCode(emailInput: string, code: string, audience: LoginAudience): Promise<VerifyResult> {
  const email = normalizeEmail(emailInput);
  const now = new Date();
  const [row] = await db
    .select()
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.email, email),
        eq(loginTokens.audience, audience),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(loginTokens.createdAt))
    .limit(1);

  const invalid = { ok: false as const, error: "That code is incorrect or has expired." };
  if (!row) return invalid;
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false, error: "Too many incorrect attempts. Request a new code." };
  }
  if (!safeEqual(row.codeHash, codeHash(row.id, code.trim()))) {
    await db.update(loginTokens).set({ attempts: sql`${loginTokens.attempts} + 1` }).where(eq(loginTokens.id, row.id));
    return invalid;
  }
  const [used] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.id, row.id), isNull(loginTokens.usedAt)))
    .returning();
  if (!used) return invalid;
  return { ok: true, email, redirectTo: row.redirectTo };
}

/** Resolve (or bootstrap) the staff account for a verified email. */
export async function resolveStaffUser(email: string): Promise<User | null> {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (!existing.active) return null;
    const [updated] = await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, existing.id)).returning();
    return updated;
  }
  if (!(await isBootstrapOwner(email))) return null;
  const [created] = await db
    .insert(users)
    .values({ email, name: "", role: "owner", lastLoginAt: new Date() })
    .onConflictDoNothing()
    .returning();
  if (!created) return null;
  await logActivity(
    { type: "user", id: created.id, label: email },
    { entityType: "user", entityId: created.id, action: "bootstrap", summary: `Owner account created for ${email}` },
  );
  return created;
}

export interface NewSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(input: {
  audience: LoginAudience;
  email: string;
  userId: string | null;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<NewSession> {
  const token = randomToken();
  const days = input.audience === "staff" ? STAFF_SESSION_DAYS : PORTAL_SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await db.insert(sessions).values({
    id: sha256(token),
    audience: input.audience,
    userId: input.userId,
    email: input.email,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    ip: input.ip ?? null,
    expiresAt,
  });
  return { token, expiresAt };
}

export interface SessionInfo {
  id: string;
  audience: LoginAudience;
  email: string;
  user: User | null;
  expiresAt: Date;
}

export async function lookupSession(token: string, audience: LoginAudience): Promise<SessionInfo | null> {
  const id = sha256(token);
  const now = new Date();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), eq(sessions.audience, audience), gt(sessions.expiresAt, now)));
  if (!row) return null;
  if (audience === "staff" && (!row.user || !row.user.active)) return null;

  // Sliding expiry, written at most once an hour.
  if (now.getTime() - row.session.lastSeenAt.getTime() > 3_600_000) {
    const days = audience === "staff" ? STAFF_SESSION_DAYS : PORTAL_SESSION_DAYS;
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + days * 86_400_000) })
      .where(eq(sessions.id, id));
  }
  return { id, audience, email: row.session.email, user: row.user, expiresAt: row.session.expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredAuthRows(): Promise<void> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, dayAgo));
}
