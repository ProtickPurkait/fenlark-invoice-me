import "./load-env";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {}, prepare: !url.includes(":6543") });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
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
