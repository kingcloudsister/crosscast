import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadPostImage } from "@/lib/post-images";
import { createOpenRouterImage } from "@/lib/openrouter";
import { buildSlideImagePrompt, collectSlideAssetUrls, SLIDE_IMAGE_MODEL } from "@/lib/rednote-slides";
import type { RedNoteSlideImage, RedNoteSlideSpec, UploadedImage } from "@/components/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type RenderRequest = {
  generationId?: unknown;
  slides?: unknown;
  images?: unknown;
  // When set, only these slide numbers are re-generated; the rest keep their images.
  regenerateBackgrounds?: unknown;
};

type SlideInput = {
  slideNumber: number;
  spec: RedNoteSlideSpec;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RenderRequest;
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  const rawMaterialImages = parseUploadedImages(body.images);
  const slides = parseSlides(body.slides);

  if (!generationId) {
    return Response.json({ error: "generationId is required." }, { status: 400 });
  }

  if (!slides.length) {
    return Response.json(
      { error: "No renderable slides. Regenerate the RedNote draft to get slide specs." },
      { status: 400 },
    );
  }

  const onlySlides = new Set(
    Array.isArray(body.regenerateBackgrounds)
      ? body.regenerateBackgrounds.filter((item): item is number => typeof item === "number")
      : [],
  );
  const slidesToRender = onlySlides.size ? slides.filter((slide) => onlySlides.has(slide.slideNumber)) : slides;

  if (!slidesToRender.length) {
    return Response.json({ error: "No matching slides to render." }, { status: 400 });
  }

  try {
    const existingContent = await loadGenerationContent(generationId);
    const existingImages: RedNoteSlideImage[] = Array.isArray(existingContent?.slideImages)
      ? (existingContent!.slideImages as RedNoteSlideImage[])
      : [];

    // Slide 1's finished image anchors the style of every later slide so the
    // carousel reads as one coherent set.
    let styleReference =
      slidesToRender.some((slide) => slide.slideNumber === slides[0].slideNumber) === false
        ? existingImages.find((item) => item.slideNumber === slides[0].slideNumber)?.url ?? null
        : null;

    const batchStamp = Date.now();
    const renderedImages: RedNoteSlideImage[] = [];
    let totalCost = 0;

    for (const slide of slidesToRender) {
      const assetUrls = collectSlideAssetUrls(slide.spec, rawMaterialImages);
      const prompt = buildSlideImagePrompt(slide.spec, {
        slideNumber: slide.slideNumber,
        slideCount: slides.length,
        assetCount: assetUrls.length,
        hasStyleReference: Boolean(styleReference),
      });

      // Gemini occasionally returns no image data on a first attempt; retry once.
      const { buffer, cost } = await withOneRetry(() =>
        createOpenRouterImage({
          model: SLIDE_IMAGE_MODEL,
          prompt,
          inputReferences: [...(styleReference ? [styleReference] : []), ...assetUrls],
        }),
      );
      totalCost += cost ?? 0;

      const url = await uploadPostImage(buffer, `rednote/${generationId}/${batchStamp}-slide-${slide.slideNumber}`);
      renderedImages.push({
        slideNumber: slide.slideNumber,
        url,
        renderedAt: new Date().toISOString(),
      });

      if (!styleReference) {
        styleReference = bufferToDataUrl(buffer);
      }
    }

    // Merge with untouched slides so partial re-renders keep the rest of the set.
    const renderedBySlide = new Map(renderedImages.map((item) => [item.slideNumber, item]));
    const slideImages = [
      ...existingImages.filter((item) => !renderedBySlide.has(item.slideNumber)),
      ...renderedImages,
    ].sort((a, b) => a.slideNumber - b.slideNumber);

    const warnings: string[] = [];
    try {
      await saveRenderResultsOnGeneration(generationId, existingContent, slideImages, slides);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      console.error("[RedNoteRender] Could not persist slide images", message);
      warnings.push(message);
    }

    return Response.json({ slideImages, backgrounds: [], cost: totalCost || null, warnings });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not render the carousel slides.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function withOneRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (caughtError) {
    console.warn("[RedNoteRender] Image generation failed once, retrying", caughtError);
    return task();
  }
}

function bufferToDataUrl(buffer: Buffer) {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return `data:image/${isJpeg ? "jpeg" : "png"};base64,${buffer.toString("base64")}`;
}

function parseSlides(value: unknown): SlideInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SlideInput | null => {
      if (!item || typeof item !== "object") return null;
      const slide = item as Record<string, unknown>;
      const slideNumber = typeof slide.slideNumber === "number" ? slide.slideNumber : null;
      const spec = slide.spec as RedNoteSlideSpec | undefined;

      if (
        slideNumber === null ||
        !spec ||
        typeof spec !== "object" ||
        !spec.text ||
        typeof spec.text.title !== "string" ||
        !spec.text.title.trim() ||
        !spec.background ||
        typeof spec.background !== "object"
      ) {
        return null;
      }

      return { slideNumber, spec };
    })
    .filter((slide): slide is SlideInput => slide !== null)
    .sort((a, b) => a.slideNumber - b.slideNumber);
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

async function loadGenerationContent(generationId: string) {
  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("content")
    .eq("id", generationId)
    .single();

  if (error) {
    throw new Error(`Generation content could not be loaded: ${error.message}`);
  }

  return data.content && typeof data.content === "object" && !Array.isArray(data.content)
    ? (data.content as Record<string, unknown>)
    : null;
}

async function saveRenderResultsOnGeneration(
  generationId: string,
  existingContent: Record<string, unknown> | null,
  slideImages: RedNoteSlideImage[],
  slides: SlideInput[],
) {
  const content = existingContent ?? {};

  // Persist the specs exactly as rendered (they carry inline text edits from the UI),
  // so what Kelly sees is what is stored.
  const specBySlide = new Map(slides.map((slide) => [slide.slideNumber, slide.spec]));
  const carouselSlides = Array.isArray(content.carouselSlides)
    ? (content.carouselSlides as Array<Record<string, unknown>>).map((slide) => {
        const spec = typeof slide.slideNumber === "number" ? specBySlide.get(slide.slideNumber) : undefined;
        return spec ? { ...slide, spec } : slide;
      })
    : content.carouselSlides;

  const { error } = await supabaseAdmin
    .from("generations")
    .update({ content: { ...content, slideImages, ...(carouselSlides ? { carouselSlides } : {}) } })
    .eq("id", generationId);

  if (error) {
    throw new Error(`Slides were rendered, but could not be saved on the generation: ${error.message}`);
  }
}
