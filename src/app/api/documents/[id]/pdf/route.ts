import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { renderDocumentPdf } from "@/lib/pdf/render";

export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/pdf">) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  try {
    const { buffer, filename } = await renderDocumentPdf(id);
    const download = new URL(request.url).searchParams.has("download");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Document not found") return new Response("Not found", { status: 404 });
    throw err;
  }
}
