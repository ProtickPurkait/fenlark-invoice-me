import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Either the root connection or an open transaction. */
export type DbOrTx = Database | Tx;

type Holder = { client: postgres.Sql; db: Database; url: string };

const globalForDb = globalThis as unknown as { __fenlarkDb?: Holder };

function connect(): Holder {
  const url = env().DATABASE_URL;
  const existing = globalForDb.__fenlarkDb;
  if (existing && existing.url === url) return existing;

  const client = postgres(url, {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: !url.includes(":6543"),
    max: process.env.VERCEL ? 5 : 10,
    idle_timeout: 20,
    onnotice: () => {},
  });
  const holder: Holder = { client, db: drizzle(client, { schema }), url };
  globalForDb.__fenlarkDb = holder;
  return holder;
}

/** Lazily-connected Drizzle instance (reused across hot reloads in dev). */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = connect().db;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closeDb(): Promise<void> {
  const holder = globalForDb.__fenlarkDb;
  if (holder) {
    globalForDb.__fenlarkDb = undefined;
    await holder.client.end({ timeout: 5 });
  }
}

export { schema };
