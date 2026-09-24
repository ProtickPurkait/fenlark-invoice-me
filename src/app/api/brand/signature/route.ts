import { getCurrentUser } from "@/lib/auth/session";
import { loadSettings } from "@/lib/settings";
import { getFile } from "@/lib/storage";

/** Signature preview for the settings page — staff only, never public. */
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const settings = await loadSettings();
  const file = settings.signaturePath ? await getFile(settings.signaturePath) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store" },
  });
}
