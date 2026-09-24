import { z } from "zod";

/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * Wraps a server-action body: known errors become `{ ok: false }` results the
 * form can display; anything else is logged and reported generically.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    // redirect() / notFound() throw special errors that Next must handle.
    if (isNextControlFlow(err)) throw err;
    if (err instanceof UserError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    if (err instanceof z.ZodError) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(err) };
    }
    if (err instanceof Error && err.name === "PermissionError") return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function isNextControlFlow(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}
