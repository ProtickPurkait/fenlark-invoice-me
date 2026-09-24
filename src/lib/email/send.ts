import "server-only";
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { emailLog, type EmailKind } from "@/lib/db/schema";
import { env } from "@/lib/env";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  kind: EmailKind;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  react: ReactElement;
  attachments?: EmailAttachment[];
  documentId?: string | null;
  createdBy?: string | null;
}

export interface SendEmailResult {
  status: "sent" | "failed" | "skipped";
  providerId?: string;
  error?: string;
}

let resendClient: Resend | null = null;

function resend(): Resend | null {
  const key = env().RESEND_API_KEY;
  if (!key) return null;
  resendClient ??= new Resend(key);
  return resendClient;
}

export function isEmailConfigured(): boolean {
  return Boolean(env().RESEND_API_KEY);
}

/** Test hook: captures outgoing mail instead of sending when set. */
type Outbox = { to: string[]; subject: string; text: string; html: string; kind: EmailKind; attachments: string[] }[];
const globalOutbox = globalThis as unknown as { __fenlarkOutbox?: Outbox };

export function captureOutbox(): Outbox {
  globalOutbox.__fenlarkOutbox = [];
  return globalOutbox.__fenlarkOutbox;
}

export function releaseOutbox(): void {
  globalOutbox.__fenlarkOutbox = undefined;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = dedupe(input.to);
  const cc = dedupe(input.cc ?? []).filter((e) => !to.includes(e));
  const bcc = dedupe(input.bcc ?? []).filter((e) => !to.includes(e) && !cc.includes(e));
  if (to.length === 0) return { status: "failed", error: "No recipient" };

  const [html, text] = await Promise.all([render(input.react), render(input.react, { plainText: true })]);

  let result: SendEmailResult;
  const outbox = globalOutbox.__fenlarkOutbox;
  const client = resend();

  if (outbox) {
    outbox.push({
      to,
      subject: input.subject,
      text,
      html,
      kind: input.kind,
      attachments: (input.attachments ?? []).map((a) => a.filename),
    });
    result = { status: "sent", providerId: `test-${outbox.length}` };
  } else if (!client) {
    // No provider configured: print to the server log (only visible to whoever runs the
    // deployment) so the owner can still sign in before e-mail is set up.
    console.info(
      `\n──── email (not sent: RESEND_API_KEY unset) ────\nTo: ${to.join(", ")}\nSubject: ${input.subject}\n\n${text}\n────────────────────────────────────────────────\n`,
    );
    result = { status: "skipped", error: "RESEND_API_KEY is not configured" };
  } else {
    try {
      const response = await client.emails.send({
        from: env().EMAIL_FROM,
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        replyTo: input.replyTo || undefined,
        subject: input.subject,
        html,
        text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      result = response.error
        ? { status: "failed", error: response.error.message }
        : { status: "sent", providerId: response.data?.id };
    } catch (err) {
      result = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  await db.insert(emailLog).values({
    kind: input.kind,
    documentId: input.documentId ?? null,
    to,
    cc,
    subject: input.subject,
    status: result.status,
    providerId: result.providerId ?? null,
    error: result.error ?? null,
    createdBy: input.createdBy ?? null,
  });

  return result;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** "a@x.com, b@y.com; c@z.com" → ["a@x.com", ...] */
export function parseEmailList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
