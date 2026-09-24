import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * File storage for logos and signatures. Supabase Storage (private bucket) in
 * production; the local `.data/uploads` folder for development.
 */

export interface StoredFile {
  data: Buffer;
  contentType: string;
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function driver(): "supabase" | "local" {
  const configured = env().STORAGE_DRIVER;
  if (configured) return configured;
  return isSupabaseConfigured() ? "supabase" : "local";
}

let supabase: SupabaseClient | null = null;
function supabaseClient(): SupabaseClient {
  const e = env();
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  supabase ??= createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

function localPath(key: string): string {
  const resolved = path.resolve(LOCAL_ROOT, key);
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Invalid storage key");
  return resolved;
}

export async function putFile(key: string, data: Buffer, contentType: string): Promise<void> {
  if (driver() === "supabase") {
    const { error } = await supabaseClient()
      .storage.from(env().SUPABASE_STORAGE_BUCKET)
      .upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return;
  }
  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

export async function getFile(key: string): Promise<StoredFile | null> {
  if (driver() === "supabase") {
    const { data, error } = await supabaseClient().storage.from(env().SUPABASE_STORAGE_BUCKET).download(key);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type || guessType(key) };
  }
  try {
    return { data: await readFile(localPath(key)), contentType: guessType(key) };
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (driver() === "supabase") {
    await supabaseClient().storage.from(env().SUPABASE_STORAGE_BUCKET).remove([key]);
    return;
  }
  await rm(localPath(key), { force: true });
}

function guessType(key: string): string {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

/** Validate an uploaded image by magic bytes (react-pdf supports PNG and JPEG). */
export function sniffImageType(data: Buffer): "image/png" | "image/jpeg" | null {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  return null;
}
