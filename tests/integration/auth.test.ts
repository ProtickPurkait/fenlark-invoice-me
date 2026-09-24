import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSession,
  lookupSession,
  MAX_REQUESTS_PER_WINDOW,
  requestLogin,
  resolveStaffUser,
  verifyLoginCode,
  verifyLoginToken,
} from "@/lib/auth/service";
import { db } from "@/lib/db";
import { clients, users } from "@/lib/db/schema";
import { captureOutbox, releaseOutbox } from "@/lib/email/send";
import { setupTestDb, teardownTestDb } from "../helpers/db";

function lastCode(outbox: ReturnType<typeof captureOutbox>): { code: string; token: string } {
  const mail = outbox[outbox.length - 1];
  const code = /code: (\d{6})/.exec(mail.subject)![1];
  const token = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
  return { code, token };
}

describe("passwordless auth", () => {
  let outbox: ReturnType<typeof captureOutbox>;

  beforeEach(async () => {
    await setupTestDb();
    outbox = captureOutbox();
  });
  afterAll(async () => {
    releaseOutbox();
    await teardownTestDb();
  });

  it("bootstraps the first user as owner (dev) and signs in with the code", async () => {
    expect((await requestLogin({ email: "Owner@Fenlark.in", audience: "staff" })).ok).toBe(true);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toEqual(["owner@fenlark.in"]);
    const { code } = lastCode(outbox);

    const wrong = await verifyLoginCode("owner@fenlark.in", code === "000000" ? "111111" : "000000", "staff");
    expect(wrong.ok).toBe(false);

    const verified = await verifyLoginCode("owner@fenlark.in", code, "staff");
    expect(verified.ok).toBe(true);
    const user = await resolveStaffUser("owner@fenlark.in");
    expect(user?.role).toBe("owner");

    // Codes are single-use.
    expect((await verifyLoginCode("owner@fenlark.in", code, "staff")).ok).toBe(false);
  });

  it("only lets OWNER_EMAIL bootstrap when it is set", async () => {
    process.env.OWNER_EMAIL = "boss@fenlark.in";
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    try {
      await requestLogin({ email: "stranger@example.com", audience: "staff" });
      expect(outbox).toHaveLength(0);
      await requestLogin({ email: "boss@fenlark.in", audience: "staff" });
      expect(outbox).toHaveLength(1);
    } finally {
      delete process.env.OWNER_EMAIL;
      resetEnvCache();
    }
  });

  it("does not email unknown addresses once users exist", async () => {
    await db.insert(users).values({ email: "owner@fenlark.in", role: "owner" });
    const result = await requestLogin({ email: "nobody@example.com", audience: "staff" });
    expect(result.ok).toBe(true);
    expect(outbox).toHaveLength(0);
  });

  it("consumes magic-link tokens once", async () => {
    await db.insert(users).values({ email: "a@fenlark.in", role: "staff" });
    await requestLogin({ email: "a@fenlark.in", audience: "staff", redirectTo: "/invoices" });
    const { token } = lastCode(outbox);
    const first = await verifyLoginToken(token, "staff");
    expect(first).toEqual({ ok: true, email: "a@fenlark.in", redirectTo: "/invoices" });
    expect((await verifyLoginToken(token, "staff")).ok).toBe(false);
    expect((await verifyLoginToken(token, "portal")).ok).toBe(false);
  });

  it("locks a code after too many wrong attempts", async () => {
    await db.insert(users).values({ email: "a@fenlark.in", role: "staff" });
    await requestLogin({ email: "a@fenlark.in", audience: "staff" });
    const { code } = lastCode(outbox);
    const bad = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 5; i++) await verifyLoginCode("a@fenlark.in", bad, "staff");
    const result = await verifyLoginCode("a@fenlark.in", code, "staff");
    expect(result.ok).toBe(false);
  });

  it("rate-limits sign-in requests", async () => {
    await db.insert(users).values({ email: "a@fenlark.in", role: "staff" });
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
      expect((await requestLogin({ email: "a@fenlark.in", audience: "staff" })).ok).toBe(true);
    }
    expect((await requestLogin({ email: "a@fenlark.in", audience: "staff" })).ok).toBe(false);
  });

  it("rejects deactivated users and their sessions", async () => {
    const [u] = await db.insert(users).values({ email: "a@fenlark.in", role: "staff" }).returning();
    const session = await createSession({ audience: "staff", email: u.email, userId: u.id });
    expect((await lookupSession(session.token, "staff"))?.user?.id).toBe(u.id);
    await db.update(users).set({ active: false }).where(eq(users.id, u.id));
    expect(await lookupSession(session.token, "staff")).toBeNull();
    expect(await resolveStaffUser("a@fenlark.in")).toBeNull();
  });

  it("lets clients into the portal by primary or CC email", async () => {
    await db.insert(users).values({ email: "owner@fenlark.in", role: "owner" });
    await db.insert(clients).values({ name: "Acme", email: "ap@acme.com", ccEmails: ["cfo@acme.com"] });
    await requestLogin({ email: "cfo@acme.com", audience: "portal" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].text).toContain("/portal/verify?token=");
    await requestLogin({ email: "random@acme.com", audience: "portal" });
    expect(outbox).toHaveLength(1);
    // A staff session token is not valid for the portal.
    const s = await createSession({ audience: "portal", email: "cfo@acme.com", userId: null });
    expect(await lookupSession(s.token, "staff")).toBeNull();
    expect((await lookupSession(s.token, "portal"))?.email).toBe("cfo@acme.com");
  });
});
