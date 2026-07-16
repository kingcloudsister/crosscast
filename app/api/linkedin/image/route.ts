import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateLinkedInImageDirect, uploadPostImage } from "@/lib/linkedin-image";
import type { PostImage, UploadedImage } from "@/components/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type ImageRequest = {
  generationId?: unknown;
  postText?: unknown;
  images?: unknown;
  currentImageUrl?: unknown;
  instructions?: unknown; // optional extra constraints passed to the Image Director
};

export async function POST(request: Request) {
  const body = (await request.json()) as ImageRequest;
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  const postText = typeof body.postText === "string" ? body.postText.trim() : "";
  const rawMaterialImages = parseUploadedImages(body.images);
  const currentImageUrl = parseImageReference(body.currentImageUrl);
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";

  if (!generationId) {
    return Response.json({ error: "generationId is required." }, { status: 400 });
  }

  if (!postText) {
    return Response.json({ error: "LinkedIn post text is required to generate an image." }, { status: 400 });
  }

  try {
    const { buffer, cost } = await generateLinkedInImageDirect(
      postText,
      rawMaterialImages,
      instructions || undefined,
      currentImageUrl || undefined,
    );
    const url = await uploadPostImage(buffer, `linkedin/${generationId}/${Date.now()}`);

    const image: PostImage = {
      url,
      generatedAt: new Date().toISOString(),
      instructions: instructions || null,
    };

    const warnings: string[] = [];
    try {
      await saveImageOnGeneration(generationId, image);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      console.error("[LinkedInImage] Could not persist image on generation", message);
      warnings.push(message);
    }

    return Response.json({ image, cost, warnings });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not generate the LinkedIn image.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function parseImageReference(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^(https?:\/\/|data:image\/)/i.test(normalized) ? normalized : "";
}

function parseUploadedImages(value: unknown): UploadedImage[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is UploadedImage =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as UploadedImage).url === "string" &&
      (item as UploadedImage).url.startsWith("data:image/"),
  );
}

async function saveImageOnGeneration(generationId: string, image: PostImage) {
  const { data: generation, error: loadError } = await supabaseAdmin
    .from("generations")
    .select("content")
    .eq("id", generationId)
    .single();

  if (loadError) {
    throw new Error(`Image was generated, but generation content could not be loaded: ${loadError.message}`);
  }

  const existingContent =
    generation.content && typeof generation.content === "object" && !Array.isArray(generation.content)
      ? (generation.content as Record<string, unknown>)
      : {};

  const { error } = await supabaseAdmin
    .from("generations")
    .update({ content: { ...existingContent, image } })
    .eq("id", generationId);

  if (error) {
    throw new Error(`Image was generated, but could not be saved on the generation: ${error.message}`);
  }
}
