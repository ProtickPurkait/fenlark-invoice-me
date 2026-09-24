import "./load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {}, prepare: !url.includes(":6543") });
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    await migrate(drizzle(client), { migrationsFolder: path.join(here, "..", "drizzle") });
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // A direct / session-mode connection is safest for DDL; falls back to the app's URL.
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("✓ Migrations applied"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
