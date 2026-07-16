import { readFileSync } from "node:fs";
import path from "node:path";
import { createOpenRouterImage } from "@/lib/openrouter";
import type { UploadedImage } from "@/components/types";

export { POST_IMAGES_BUCKET, uploadPostImage } from "@/lib/post-images";

function loadLinkedInImageSystemPrompt() {
  return readFileSync(path.join(process.cwd(), "prompts", "linkedin-image.md"), "utf8");
}

// Single-call pipeline: the Image Director prompt + final post text go straight to the
// image model, with raw-material uploads passed as reference images (labelled
// asset_0, asset_1, ... in the order they are attached). The model chooses the
// canvas itself, guided by the prompt's composition rules.
export async function generateLinkedInImageDirect(
  postText: string,
  rawMaterialImages: UploadedImage[] = [],
  extraInstructions?: string,
  currentImageUrl?: string,
) {
  const systemPrompt = loadLinkedInImageSystemPrompt();
  const references = [
    ...(currentImageUrl ? [{ label: "current_generated_image", url: currentImageUrl, name: undefined }] : []),
    ...rawMaterialImages.map((image, index) => ({
      label: `asset_${index}`,
      url: image.url,
      name: image.name,
    })),
  ];
  const assetManifest = references.length
    ? `assets (attached as reference images, in order): ${references
        .map((reference) => `${reference.label}${reference.name ? ` = ${reference.name}` : ""}`)
        .join(", ")}`
    : "assets: none provided";

  const prompt = [
    systemPrompt,
    `final_linkedin_post:\n${postText}`,
    assetManifest,
    extraInstructions ? `Additional constraints from the user:\n${extraInstructions}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return createOpenRouterImage({
    prompt,
    inputReferences: references.map((reference) => reference.url),
  });
}
