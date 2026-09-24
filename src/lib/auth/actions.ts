"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { LoginAudience } from "@/lib/db/schema";
import { runAction, UserError, type ActionResult } from "@/lib/errors";
import { endSession, startSession } from "./session";
import { requestLogin, resolveStaffUser, verifyLoginCode, verifyLoginToken } from "./service";

const audienceSchema = z.enum(["staff", "portal"]);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address" }));

export async function requestLoginAction(input: {
  audience: LoginAudience;
  email: string;
  redirectTo?: string | null;
}): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    const audience = audienceSchema.parse(input.audience);
    const email = emailSchema.parse(input.email);
    const result = await requestLogin({ email, audience, redirectTo: input.redirectTo });
    if (!result.ok) throw new UserError(result.error);
    return { email };
  });
}

async function finishLogin(audience: LoginAudience, email: string, redirectTo: string | null): Promise<string> {
  if (audience === "staff") {
    const user = await resolveStaffUser(email);
    if (!user) throw new UserError("This account is not active. Ask an admin to invite you.");
    await startSession("staff", email, user.id);
    return redirectTo ?? "/dashboard";
  }
  await startSession("portal", email, null);
  return redirectTo ?? "/portal";
}

export async function verifyCodeAction(input: {
  audience: LoginAudience;
  email: string;
  code: string;
}): Promise<ActionResult<never>> {
  let destination: string | null = null;
  const result = await runAction(async () => {
    const audience = audienceSchema.parse(input.audience);
    const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code").parse(input.code);
    const verified = await verifyLoginCode(input.email, code, audience);
    if (!verified.ok) throw new UserError(verified.error);
    destination = await finishLogin(audience, verified.email, verified.redirectTo);
  });
  if (destination) redirect(destination);
  return result as ActionResult<never>;
}

export async function verifyTokenAction(audience: LoginAudience, token: string): Promise<ActionResult<never>> {
  let destination: string | null = null;
  const result = await runAction(async () => {
    const aud = audienceSchema.parse(audience);
    const verified = await verifyLoginToken(token, aud);
    if (!verified.ok) throw new UserError(verified.error);
    destination = await finishLogin(aud, verified.email, verified.redirectTo);
  });
  if (destination) redirect(destination);
  return result as ActionResult<never>;
}

export async function signOutAction(audience: LoginAudience): Promise<void> {
  await endSession(audienceSchema.parse(audience));
  redirect(audience === "staff" ? "/login" : "/portal/login");
}
