import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Parsed lazily so `next build` works without secrets;
 * each accessor throws a readable error the first time a missing value is needed.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),

  /** First sign-in with this address creates the owner account when no users exist yet. */
  OWNER_EMAIL: z.string().email().optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("fenlark"),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Fenlark Billing <billing@fenlark.in>"),

  /** 32 random bytes, base64. Encrypts payment-gateway credentials at rest. */
  ENCRYPTION_KEY: z.string().optional(),
  /** Shared secret Vercel Cron sends as `Authorization: Bearer …`. */
  CRON_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(["supabase", "local"]).optional(),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // Treat blank values (`KEY=` in .env files) as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}

export function isSupabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);
}

/** Tests and scripts swap DATABASE_URL etc. at runtime. */
export function resetEnvCache(): void {
  cached = null;
}

export function appUrl(path = ""): string {
  return new URL(path, env().APP_URL).toString();
}
