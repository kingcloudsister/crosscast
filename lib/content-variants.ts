import type {
  ContentVariant,
  PlatformContent,
  PlatformContentBase,
  PlatformKey,
} from "@/components/types";

const metadataKeys = new Set(["variants", "recommendedVariantId", "selectedVariantId", "variantPreference"]);

export function getContentVariants(content: PlatformContent) {
  return Array.isArray(content.variants) ? (content.variants as ContentVariant<PlatformContentBase>[]) : [];
}

export function snapshotPlatformContent(content: PlatformContent): PlatformContentBase {
  return Object.fromEntries(Object.entries(content).filter(([key]) => !metadataKeys.has(key))) as PlatformContentBase;
}

export function selectContentVariant(content: PlatformContent, variantId: string): PlatformContent {
  const variants = getContentVariants(content);
  const selected = variants.find((variant) => variant.id === variantId);
  if (!selected) return content;

  const recommendedVariantId = content.recommendedVariantId ?? variants[0]?.id ?? variantId;
  return {
    ...structuredClone(selected.content),
    variants,
    recommendedVariantId,
    selectedVariantId: variantId,
    variantPreference: {
      selectedVariantId: variantId,
      recommendedVariantId,
      selectedAt: new Date().toISOString(),
      followedRecommendation: variantId === recommendedVariantId,
    },
  } as PlatformContent;
}

export function syncSelectedVariant(content: PlatformContent): PlatformContent {
  const variants = getContentVariants(content);
  const selectedVariantId = content.selectedVariantId;
  if (!variants.length || !selectedVariantId) return content;

  const snapshot = snapshotPlatformContent(content);
  return {
    ...content,
    variants: variants.map((variant) =>
      variant.id === selectedVariantId ? { ...variant, content: snapshot } : variant,
    ),
  } as PlatformContent;
}

export function preserveVariantState(previous: PlatformContent | null, next: PlatformContent): PlatformContent {
  if (!previous || !getContentVariants(previous).length) return next;

  const merged = {
    ...next,
    variants: previous.variants,
    recommendedVariantId: previous.recommendedVariantId,
    selectedVariantId: previous.selectedVariantId,
    variantPreference: previous.variantPreference,
  } as PlatformContent;

  return syncSelectedVariant(merged);
}

export function normalizeGeneratedVariants(platform: PlatformKey, raw: unknown): PlatformContent {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawVariants = Array.isArray(record.variants) ? record.variants : [];
  if (!rawVariants.length) return record as PlatformContent;

  const recommended = record.recommended !== false;
  const recommendedReason = typeof record.recommendedReason === "string" ? record.recommendedReason : null;
  const skipReason = typeof record.skipReason === "string" ? record.skipReason : null;
  const variants = rawVariants.slice(0, 3).map((item, index) => {
    const variant = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const nested = variant.content && typeof variant.content === "object" ? variant.content : variant;
    const snapshot = {
      ...(nested as Record<string, unknown>),
      recommended,
      recommendedReason,
      skipReason,
    } as PlatformContentBase;
    return {
      id: typeof variant.id === "string" && variant.id.trim() ? variant.id.trim() : `variant-${index + 1}`,
      label: typeof variant.label === "string" && variant.label.trim() ? variant.label.trim() : `Option ${index + 1}`,
      rationale:
        typeof variant.rationale === "string" && variant.rationale.trim()
          ? variant.rationale.trim()
          : "A distinct way to express the same narrative.",
      content: snapshot,
    };
  });

  const requestedRecommendedId = typeof record.recommendedVariantId === "string" ? record.recommendedVariantId : "";
  const recommendedVariantId = variants.some((variant) => variant.id === requestedRecommendedId)
    ? requestedRecommendedId
    : variants[0].id;
  const selected = variants.find((variant) => variant.id === recommendedVariantId) ?? variants[0];

  return {
    ...selected.content,
    variants,
    recommendedVariantId,
    selectedVariantId: recommendedVariantId,
  } as PlatformContent;
}
