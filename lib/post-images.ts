import { supabaseAdmin } from "@/lib/supabase-admin";

export const POST_IMAGES_BUCKET = "post-images";

// storagePath is extension-less; the extension is derived from the actual image bytes
// because providers sometimes return JPEG even when PNG is requested.
export async function uploadPostImage(buffer: Buffer, storagePath: string) {
  await ensurePostImagesBucket();

  const { extension, contentType } = detectImageFormat(buffer);
  const fullPath = `${storagePath}.${extension}`;

  const { error } = await supabaseAdmin.storage.from(POST_IMAGES_BUCKET).upload(fullPath, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Could not upload image to storage: ${error.message}`);
  }

  const { data } = supabaseAdmin.storage.from(POST_IMAGES_BUCKET).getPublicUrl(fullPath);
  return data.publicUrl;
}

function detectImageFormat(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", contentType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (buffer.length >= 12 && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  return { extension: "png", contentType: "image/png" };
}

async function ensurePostImagesBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(POST_IMAGES_BUCKET, { public: true });

  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create the ${POST_IMAGES_BUCKET} bucket: ${error.message}`);
  }
}
