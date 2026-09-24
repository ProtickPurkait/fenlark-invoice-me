import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Parsed lazily so `next build` works without secrets;
 * each accessor throws a readable error the first time a missing value is needed.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
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
  const parsed = schema.safeParse(process.env);
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
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY);
}

export function appUrl(path = ""): string {
  return new URL(path, env().APP_URL).toString();
}
