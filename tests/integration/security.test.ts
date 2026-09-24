import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { seedClient } from "../helpers/fixtures";
import { setupTestDb, teardownTestDb } from "../helpers/db";

const PROBE_ROLE = "fenlark_rls_probe";

describe("row-level security", () => {
  beforeEach(setupTestDb);
  afterAll(async () => {
    await db.execute(sql.raw(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN DROP OWNED BY ${PROBE_ROLE}; DROP ROLE ${PROBE_ROLE}; END IF; END $$`));
    await teardownTestDb();
  });

  it("is enabled on every application table", async () => {
    const rows = await db.execute<{ relname: string }>(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("hides rows from roles other than the owner", async () => {
    await seedClient();
    await db.execute(sql.raw(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN CREATE ROLE ${PROBE_ROLE} NOLOGIN; END IF; END $$`));
    await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}; GRANT SELECT ON clients TO ${PROBE_ROLE}`));

    const asProbe = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${PROBE_ROLE}`));
      return tx.execute<{ n: number }>(sql`select count(*)::int as n from clients`);
    });
    expect(asProbe[0].n).toBe(0);

    const asOwner = await db.execute<{ n: number }>(sql`select count(*)::int as n from clients`);
    expect(asOwner[0].n).toBe(1);
  });
});
