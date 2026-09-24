import { sql } from "drizzle-orm";
import { runMigrations } from "../../scripts/migrate";
import { closeDb, db } from "@/lib/db";

let migrated: Promise<void> | null = null;

/** Apply migrations once per test file, then start from empty tables. */
export async function setupTestDb(): Promise<void> {
  migrated ??= runMigrations(process.env.DATABASE_URL!);
  await migrated;
  await truncateAll();
}

export async function truncateAll(): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'`,
  );
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (tables) await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}

export async function teardownTestDb(): Promise<void> {
  await closeDb();
}
