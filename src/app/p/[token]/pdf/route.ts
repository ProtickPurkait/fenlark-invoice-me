import { renderDocumentPdf } from "@/lib/pdf/render";
import { findByPublicToken } from "@/lib/public/queries";

export async function GET(request: Request, ctx: RouteContext<"/p/[token]/pdf">) {
  const { token } = await ctx.params;
  const doc = await findByPublicToken(token);
  if (!doc) return new Response("Not found", { status: 404 });
  const { buffer, filename } = await renderDocumentPdf(doc.id);
  const inline = new URL(request.url).searchParams.has("inline");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
