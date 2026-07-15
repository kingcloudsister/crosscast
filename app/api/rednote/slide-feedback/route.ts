import { readFileSync } from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadPostImage } from "@/lib/post-images";
import {
  createOpenRouterChatCompletion,
  createOpenRouterImage,
  extractTextContent,
  parseJsonFromOpenRouterContent,
} from "@/lib/openrouter";
import { buildSlideImagePrompt, collectSlideAssetUrls, SLIDE_IMAGE_MODEL } from "@/lib/rednote-slides";
import type { RedNoteSlideImage, RedNoteSlideSpec, UploadedImage } from "@/components/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type FeedbackRequest = {
  generationId?: unknown;
  slideNumber?: unknown;
  spec?: unknown;
  comment?: unknown;
  images?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as FeedbackRequest;
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  const slideNumber = typeof body.slideNumber === "number" ? body.slideNumber : null;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const spec = body.spec as RedNoteSlideSpec | undefined;
  const rawMaterialImages = parseUploadedImages(body.images);

  if (!generationId || slideNumber === null) {
    return Response.json({ error: "generationId and slideNumber are required." }, { status: 400 });
  }

  if (!comment) {
    return Response.json({ error: "A feedback comment is required." }, { status: 400 });
  }

  if (!spec?.text?.title || !spec.background) {
    return Response.json({ error: "This slide has no spec to revise." }, { status: 400 });
  }

  try {
    const revisedSpec = await reviseSlideSpec(spec, comment);

    // Slide 1's existing image anchors the carousel style for the regenerated slide.
    const existing = await loadExistingSlideImages(generationId);
    const styleReference = existing.find((item) => item.slideNumber !== slideNumber)?.url ?? null;

    const assetUrls = collectSlideAssetUrls(revisedSpec, rawMaterialImages);
    const prompt = buildSlideImagePrompt(revisedSpec, {
      slideNumber,
      slideCount: Math.max(existing.length, slideNumber),
      assetCount: assetUrls.length,
      hasStyleReference: Boolean(styleReference),
    });
    const { buffer } = await createOpenRouterImage({
      model: SLIDE_IMAGE_MODEL,
      prompt,
      inputReferences: [...(styleReference ? [styleReference] : []), ...assetUrls],
    });
    const url = await uploadPostImage(buffer, `rednote/${generationId}/${Date.now()}-slide-${slideNumber}`);
    const slideImage: RedNoteSlideImage = {
      slideNumber,
      url,
      renderedAt: new Date().toISOString(),
    };

    const warnings: string[] = [];
    try {
      await saveRevisedSlide(generationId, slideNumber, revisedSpec, slideImage);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      console.error("[RedNoteSlideFeedback] Could not persist revised slide", message);
      warnings.push(message);
    }

    return Response.json({ spec: revisedSpec, slideImage, warnings });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not revise the slide.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function reviseSlideSpec(spec: RedNoteSlideSpec, comment: string): Promise<RedNoteSlideSpec> {
  const systemPrompt = readFileSync(path.join(process.cwd(), "prompts", "rednote-slide-feedback.md"), "utf8");

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await createOpenRouterChatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Current slide spec:\n${JSON.stringify(spec, null, 2)}\n\nKelly's comment:\n${comment}`,
          },
        ],
        maxTokens: 2000,
        temperature: attempt === 0 ? 0.6 : 0.3,
        responseFormat: { type: "json_object" },
      });

      const parsed = parseJsonFromOpenRouterContent(extractTextContent(response)) as RedNoteSlideSpec;
      if (!parsed?.text?.title || typeof parsed.text.title !== "string" || !parsed.background) {
        throw new Error("Revised spec is missing required fields.");
      }
      return parsed;
    } catch (caughtError) {
      lastError = caughtError;
      console.error(`[RedNoteSlideFeedback] Revision attempt ${attempt + 1} failed`, caughtError);
    }
  }

  throw new Error(
    `Could not revise the slide spec: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function loadExistingSlideImages(generationId: string): Promise<RedNoteSlideImage[]> {
  const { data, error } = await supabaseAdmin.from("generations").select("content").eq("id", generationId).single();
  if (error) return [];
  const content = data.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const slideImages = (content as Record<string, unknown>).slideImages;
  return Array.isArray(slideImages) ? (slideImages as RedNoteSlideImage[]) : [];
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

async function saveRevisedSlide(
  generationId: string,
  slideNumber: number,
  spec: RedNoteSlideSpec,
  slideImage: RedNoteSlideImage,
) {
  const { data: generation, error: loadError } = await supabaseAdmin
    .from("generations")
    .select("content")
    .eq("id", generationId)
    .single();

  if (loadError) {
    throw new Error(`Slide was revised, but generation content could not be loaded: ${loadError.message}`);
  }

  const existingContent =
    generation.content && typeof generation.content === "object" && !Array.isArray(generation.content)
      ? (generation.content as Record<string, unknown>)
      : {};

  const carouselSlides = Array.isArray(existingContent.carouselSlides)
    ? (existingContent.carouselSlides as Array<Record<string, unknown>>).map((slide) =>
        slide.slideNumber === slideNumber ? { ...slide, spec } : slide,
      )
    : existingContent.carouselSlides;

  const slideImages = Array.isArray(existingContent.slideImages)
    ? (existingContent.slideImages as RedNoteSlideImage[]).map((item) =>
        item.slideNumber === slideNumber ? slideImage : item,
      )
    : [slideImage];

  const { error } = await supabaseAdmin
    .from("generations")
    .update({
      content: { ...existingContent, slideImages, ...(carouselSlides ? { carouselSlides } : {}) },
    })
    .eq("id", generationId);

  if (error) {
    throw new Error(`Slide was revised, but could not be saved on the generation: ${error.message}`);
  }
}
