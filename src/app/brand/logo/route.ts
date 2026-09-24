import { getFile } from "@/lib/storage";
import { loadSettings } from "@/lib/settings";

/** Public: the business logo is shown on sign-in pages, emails and the client portal. */
export async function GET() {
  const settings = await loadSettings();
  const file = settings.logoPath ? await getFile(settings.logoPath) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
