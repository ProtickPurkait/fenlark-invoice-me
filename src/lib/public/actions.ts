"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { respondToQuote } from "@/lib/documents/service";
import { runAction, UserError, type ActionResult } from "@/lib/errors";
import { paymentLinkFor } from "@/lib/gateways/service";
import { findByPublicToken } from "./queries";

const token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

export async function payOnlineAction(publicToken: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const doc = await findByPublicToken(token.parse(publicToken));
    if (!doc) throw new UserError("Document not found");
    try {
      return { url: await paymentLinkFor(doc.id) };
    } catch (err) {
      if (err instanceof UserError) throw err;
      console.error("[pay-online]", err);
      throw new UserError("The payment page couldn't be opened right now. Please try again, or pay by bank transfer / UPI.");
    }
  });
}

export async function respondQuoteByTokenAction(publicToken: string, response: "accepted" | "declined"): Promise<ActionResult<null>> {
  return runAction(async () => {
    const doc = await findByPublicToken(token.parse(publicToken));
    if (!doc || doc.type !== "quote") throw new UserError("Quote not found");
    if (doc.validUntil && doc.validUntil < new Date().toISOString().slice(0, 10) && response === "accepted") {
      throw new UserError("This quote has expired. Please contact us for an updated quote.");
    }
    const name = doc.clientSnapshot?.name ?? "Client";
    await respondToQuote({ type: "client", id: doc.clientId, label: name }, doc.id, z.enum(["accepted", "declined"]).parse(response));
    revalidatePath(`/p/${publicToken}`);
    return null;
  }, response === "accepted" ? "Thank you — quote accepted" : "Quote declined");
}
