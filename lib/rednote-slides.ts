import { readFileSync } from "node:fs";
import path from "node:path";
import type { CardSpec } from "@/lib/card-renderer";
import type { RedNoteSlideSpec, UploadedImage } from "@/components/types";

// GPT Image has no aspect-ratio parameter: the prompt asks for a 3:4 composition and
// the model picks a portrait canvas (typically 1024x1536, i.e. 2:3).
export const SLIDE_IMAGE_MODEL = "openai/gpt-image-2";

export function loadRedNoteSlideImagePrompt() {
  return readFileSync(path.join(process.cwd(), "prompts", "rednote-slide-image.md"), "utf8");
}

// Assets this slide actually references (media items + full-bleed background asset).
export function collectSlideAssetUrls(spec: RedNoteSlideSpec, rawMaterialImages: UploadedImage[]) {
  const refs = [
    ...(spec.media ?? []).map((item) => item.assetRef),
    ...(spec.background.type === "asset" && spec.background.assetRef ? [spec.background.assetRef] : []),
  ];

  return Array.from(new Set(refs))
    .map((ref) => (ref ? resolveAssetUrl(ref, rawMaterialImages) : null))
    .filter((url): url is string => Boolean(url));
}

export function buildSlideImagePrompt(
  spec: RedNoteSlideSpec,
  options: { slideNumber: number; slideCount: number; assetCount: number; hasStyleReference: boolean },
) {
  const text = spec.text;
  const lines: string[] = [
    loadRedNoteSlideImagePrompt(),
    "",
    `## THIS SLIDE (${options.slideNumber} of ${options.slideCount})`,
    "",
    `Role: ${spec.role} · kind: ${spec.kind}${spec.layout ? ` · layout intent: ${spec.layout}` : ""}`,
  ];

  if (text.eyebrow) lines.push(`Eyebrow badge text: "${text.eyebrow}"`);
  lines.push(`Headline (Chinese, render EXACTLY): "${text.title}"`);
  if (text.productName) lines.push(`Product name (coral handwritten script with underline): "${text.productName}"`);
  if (text.subtitle) lines.push(`Subtitle: "${text.subtitle}"`);

  const body = (text.body ?? []).filter((line) => line.trim());
  if (body.length) {
    lines.push("Body lines (render exactly, short, generous spacing):");
    body.forEach((line) => lines.push(`- "${line}"`));
  }
  if (text.footer) lines.push(`Footer (small, bottom): "${text.footer}"`);

  const media = spec.media ?? [];
  if (media.length) {
    lines.push(
      `Screenshots: embed the ${media.length} attached real screenshot(s) prominently (large, legible, faithful to the reference).`,
    );
    media.forEach((item, index) => {
      if (item.annotation?.trim()) {
        lines.push(`- screenshot ${index + 1}: hand-drawn coral arrow + label "${item.annotation.trim()}"`);
      }
    });
  } else if (spec.kind === "illustration" && spec.background.ai_prompt) {
    lines.push(`Background scene: ${spec.background.ai_prompt}`);
  } else {
    lines.push("No screenshots on this slide: typography-led editorial layout.");
  }

  const accent = spec.style?.accentColor ?? "#E0566E";
  lines.push(`Accent colour: ${accent}. Background: warm cream.`);
  if (spec.accent?.doodle && spec.accent.doodle !== "none") {
    lines.push(`Doodle: one hand-drawn coral ${spec.accent.doodle}.`);
  }

  const comp = spec.composition ?? {};
  if (comp.mediaScale) lines.push(`Media prominence: ${comp.mediaScale}.`);
  if (comp.verticalBalance) lines.push(`Vertical balance: ${comp.verticalBalance.replace("_", " ")}.`);

  lines.push("");
  lines.push(
    options.hasStyleReference
      ? "The FIRST attached image is the STYLE REFERENCE (a finished slide of this carousel): match its style exactly. The remaining attached images are the real screenshots to embed."
      : "All attached images are real screenshots to embed faithfully.",
  );
  lines.push("Canvas: 3:4 vertical. Render all specified text exactly; add no other text.");

  return lines.join("\n");
}

export function slideSpecToCardSpec(spec: RedNoteSlideSpec, rawMaterialImages: UploadedImage[]): CardSpec {
  const colors = (spec.background.colors ?? []).filter((color) => typeof color === "string" && color.trim());
  const style = deriveStyle(colors[0]);

  const imageUrl =
    spec.background.type === "asset" && spec.background.assetRef
      ? resolveAssetUrl(spec.background.assetRef, rawMaterialImages)
      : spec.background.type === "ai"
        ? spec.background.generatedUrl ?? null
        : null;

  const background: CardSpec["background"] = imageUrl
    ? { type: "image", imageUrl }
    : spec.background.type === "solid" && colors.length
      ? { type: "solid", colors }
      : // gradient, ai without a generated background yet, asset with a missing ref, or missing colors
        { type: "gradient", colors: colors.length >= 2 ? colors : undefined };

  // Real assets placed inside the slide as framed media cards.
  const media = (spec.media ?? [])
    .map((item) => ({
      url: item.assetRef ? resolveAssetUrl(item.assetRef, rawMaterialImages) : null,
      fit: item.fit === "cover" ? ("cover" as const) : ("contain" as const),
      caption: item.annotation?.trim() ? item.annotation.trim() : null,
    }))
    .filter((item): item is { url: string; fit: "contain" | "cover"; caption: string | null } => Boolean(item.url))
    .slice(0, 3);

  const composition = spec.composition ?? {};
  const maxBullets =
    composition.allowBullets === false
      ? 5
      : typeof composition.maxBulletCount === "number" && composition.maxBulletCount > 0
        ? composition.maxBulletCount
        : 5;

  return {
    preset: "rednote",
    layout: "cover",
    style,
    accentColor: spec.style?.accentColor,
    background,
    eyebrow: spec.text.eyebrow ?? null,
    title: spec.text.title,
    productName: spec.text.productName ?? null,
    subtitle: spec.text.subtitle ?? null,
    footer: spec.text.footer ?? null,
    bullets: Array.isArray(spec.text.body)
      ? spec.text.body.filter((line) => line.trim()).slice(0, maxBullets)
      : [],
    // allowBullets=false renders body as plain editorial lines without dots.
    bulletDots: composition.allowBullets !== false,
    media,
    align: spec.style?.alignment === "center" ? "center" : "left",
    headlineScale: composition.headlineScale,
    mediaWidthPct: composition.mediaWidthPct,
    mediaHeightPct: composition.mediaHeightPct,
    // hero_asset leads with the visual; everything else leads with the title.
    titlePosition: spec.layout === "hero_asset" ? "below" : "above",
  };
}

function resolveAssetUrl(assetRef: string, rawMaterialImages: UploadedImage[]) {
  const match = assetRef.match(/^asset_(\d+)$/);
  if (!match) return null;
  return rawMaterialImages[Number(match[1])]?.url ?? null;
}

// The slide spec carries background colors but no dark/light flag; derive it from
// the first background colour's luminance so text stays readable.
function deriveStyle(color: string | undefined): "dark" | "light" {
  if (!color) return "dark";
  const hex = color.replace("#", "");
  const expanded = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (expanded.length < 6) return "dark";

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "dark";

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "light" : "dark";
}
