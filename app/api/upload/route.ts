// POST /api/upload multipart "file" (JPEG/PNG/WebP, 10 MB max) -> UploadResponse. Owner: Backend.
// local store: saved under .data/uploads and served by GET /api/upload/[id].
// supabase store: uploaded to the public "photos" Storage bucket; the public URL is returned.
import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import type { UploadResponse } from "@/types/contracts";
import { requireSession } from "@/lib/auth/session";
import { getStore, newId } from "@/lib/db";
import { HttpError, handler, json } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const uploadDir = () => path.resolve(process.cwd(), ".data", "uploads");

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Body must be multipart/form-data with a \"file\" field");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "Missing \"file\" field");
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new HttpError(400, "Only JPEG, PNG and WebP images are accepted");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Image is larger than 10 MB");
  if (file.size === 0) throw new HttpError(400, "Empty file");

  const id = `${newId()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (getStore().kind === "supabase") {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new HttpError(500, "Storage is not configured");
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const objectPath = `${userId}/${id}`;
    const { error } = await supabase.storage.from("photos").upload(objectPath, bytes, { contentType: file.type, upsert: false });
    if (error) throw new HttpError(502, "Upload failed");
    const { data } = supabase.storage.from("photos").getPublicUrl(objectPath);
    const body: UploadResponse = { url: data.publicUrl };
    return json(body, { status: 201 });
  }

  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  const body: UploadResponse = { url: `/api/upload/${id}` };
  return json(body, { status: 201 });
});
