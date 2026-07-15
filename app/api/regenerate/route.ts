import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BriefState, GeneratedContent, PlatformKey } from "@/components/types";
import {
  GENERATION_SYSTEM_PROMPT,
  loadRedNoteSlideSpecPrompt,
  normalizeGenerationPlatforms,
  normalizePlatformsShape,
  validateGeneration,
} from "@/lib/generation-utils";
import { sanitizePlatformContent } from "@/lib/content-sanitizer";
import { preserveVariantState } from "@/lib/content-variants";
import type { PlatformContent } from "@/components/types";
import {
  buildVisionUserContent,
  createOpenRouterChatCompletion,
  extractTextContent,
  parseJsonFromOpenRouterContent,
} from "@/lib/openrouter";
import { isPlatformKey } from "@/lib/platforms";

export const runtime = "nodejs";
export const maxDuration = 300;

type RegenerateRequest = {
  generationId?: unknown;
  feedback?: unknown;
};

type GenerationRow = {
  id: string;
  session_id: string;
  platform: string;
  content: Record<string, unknown> | null;
};

type SessionRow = {
  theme: string | null;
  raw_material: string | null;
  additional_context: string | null;
  images: BriefState["images"] | null;
  selected_platforms: PlatformKey[] | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegenerateRequest;
    const generationId = typeof body.generationId === "string" ? body.generationId : "";
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";

    if (!generationId) {
      return Response.json({ error: "Generation ID is required." }, { status: 400 });
    }

    if (!feedback) {
      return Response.json({ error: "Feedback is required." }, { status: 400 });
    }

    const generationRow = await loadGeneration(generationId);
    if (!isPlatformKey(generationRow.platform)) {
      return Response.json({ error: "Unknown generation platform." }, { status: 400 });
    }

    const sessionRow = await loadSession(generationRow.session_id);
    const platform = generationRow.platform;
    const regenerated = await callOpenRouterForPlatform({
      session: sessionRow,
      platform,
      previousContent: generationRow.content,
      feedback,
    });
    const sanitized = sanitizePlatformContent(platform, regenerated.platforms[platform]);

    if (!sanitized) {
      throw new Error("OpenRouter did not return regenerated content for the requested platform.");
    }
    const content = preserveVariantState(
      generationRow.content as PlatformContent | null,
      sanitized as PlatformContent,
    );

    const { error } = await supabaseAdmin
      .from("generations")
      .update({
        content,
        status: "draft",
        recommended: content.recommended,
        skip_reason: content.skipReason,
        angle: content.angle,
      })
      .eq("id", generationId);

    if (error) {
      throw new Error(`Could not save regenerated content: ${error.message}`);
    }

    return Response.json({
      generationId,
      platform,
      content,
      contentAnalysis: regenerated.contentAnalysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Regeneration failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function loadGeneration(generationId: string): Promise<GenerationRow> {
  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("id, session_id, platform, content")
    .eq("id", generationId)
    .single();

  if (error) {
    throw new Error(`Could not load generation: ${error.message}`);
  }

  return data;
}

async function loadSession(sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("theme, raw_material, additional_context, images, selected_platforms")
    .eq("id", sessionId)
    .single();

  if (error) {
    throw new Error(`Could not load session brief: ${error.message}`);
  }

  return data;
}

async function callOpenRouterForPlatform({
  session,
  platform,
  previousContent,
  feedback,
}: {
  session: SessionRow;
  platform: PlatformKey;
  previousContent: Record<string, unknown> | null;
  feedback: string;
}): Promise<GeneratedContent> {
  const prompt = JSON.stringify(
    {
      instruction: "Regenerate only the requested platform. Keep the same JSON structure but include only that platform.",
      selectedPlatforms: [platform],
      feedback,
      styleRules: [
        "The writing examples in the system prompt exist only to demonstrate voice, tone, rhythm, and structure. Never reuse their content, scenarios, topics, phrasings, or specific details. Write only from the current raw material.",
        "Never use em-dashes, including the — character or the Chinese ——, anywhere in generated content.",
        "Never include confidential or specific business details in generated content. Genericize partner names, partner types, company names, client names, deal details, metrics, dollar figures, screenshot names, logos, and proprietary details.",
        "For RedNote, return titleOptions as an array of exactly 3 title strings. Each title must be 20 Chinese characters or fewer, include a genuine hook rather than a flat description, and use a different hook type from the other two. Do not return a single title field for new RedNote drafts.",
        "For Threads, return topicTag as one primary recommended topic and topicAlternatives as exactly 2 alternatives. Each topic must be 1 to 50 characters, use common standard phrasing, contain no periods, and contain no ampersands.",
        "Do not mention internal workflow details such as user chose to generate, generate anyway, force generation, not recommended, or poor fit.",
        "Write the platform angle as audience-facing strategy only. Keep it concise: a short strategic label or phrase, ideally 6-14 words, never a paragraph.",
        "If recommended is true, include recommendedReason as 1-2 concise lines explaining why this platform fits. If recommended is false, set recommendedReason to null.",
        "If this platform was previously marked not recommended, still produce the best native version for the platform without apologizing or explaining the prior recommendation.",
      ],
      originalBrief: {
        theme: session.theme ?? "",
        rawMaterial: session.raw_material ?? "",
        additionalContext: session.additional_context ?? "",
        images: (session.images ?? []).map((image) => ({
          name: image.name,
        })),
      },
      previousContent,
    },
    null,
    2,
  );
  const userContent = buildVisionUserContent(prompt, session.images ?? []);
  console.log(
    "[OpenRouter] Regenerate vision request content blocks:",
    userContent.map((block) => {
      if (block.type === "text") {
        return {
          type: "text",
          characters: block.text.length,
        };
      }

      return {
        type: "image_url",
        isDataUrl: block.image_url.url.startsWith("data:image/"),
        prefix: block.image_url.url.slice(0, 32),
        characters: block.image_url.url.length,
      };
    }),
  );

  // Slide specs roughly double the size of a RedNote response; leave generous headroom
  // so the JSON never gets truncated mid-object (billed only for tokens actually produced).
  const response = await createOpenRouterChatCompletion({
    maxTokens: 10000,
    temperature: 0.7,
    responseFormat: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `${GENERATION_SYSTEM_PROMPT}\n\n${loadRedNoteSlideSpecPrompt()}`,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const text = extractTextContent(response);
  console.log("[OpenRouter] Raw regenerate chat completion response:", JSON.stringify(response, null, 2));
  console.log("[OpenRouter] Raw regenerate message.content:", text);

  if (!text) {
    throw new Error("OpenRouter returned an empty regenerated response.");
  }

  return normalizeGenerationPlatforms(
    coerceRegeneratedContent(normalizePlatformsShape(parseJsonFromOpenRouterContent(text)), platform, session, previousContent),
    [platform],
  );
}

function coerceRegeneratedContent(
  value: unknown,
  platform: PlatformKey,
  session: SessionRow,
  previousContent: Record<string, unknown> | null,
): GeneratedContent {
  const parsed = value as Partial<GeneratedContent> & Record<string, unknown>;

  if (parsed.contentAnalysis && parsed.platforms) {
    return validateGeneration(parsed);
  }

  // A platforms object without contentAnalysis still carries the draft we need.
  const nestedPlatforms =
    parsed.platforms && typeof parsed.platforms === "object" && !Array.isArray(parsed.platforms)
      ? (parsed.platforms as Record<string, unknown>)
      : null;

  const platformContent =
    nestedPlatforms?.[platform] ??
    (nestedPlatforms ? findPlatformContentByLooseKey(nestedPlatforms, platform) : null) ??
    parsed[platform] ??
    findPlatformContentByLooseKey(parsed, platform);
  if (platformContent) {
    return {
      contentAnalysis: {
        contentType: "Regenerated platform draft",
        summary: session.theme ?? session.raw_material ?? "Regenerated content",
      },
      platforms: {
        [platform]: cleanRegeneratedPlatformContent(platformContent, previousContent),
      },
    } as GeneratedContent;
  }

  if (looksLikePlatformContent(parsed)) {
    return {
      contentAnalysis: {
        contentType: "Regenerated platform draft",
        summary: session.theme ?? session.raw_material ?? "Regenerated content",
      },
      platforms: {
        [platform]: cleanRegeneratedPlatformContent(parsed, previousContent),
      },
    } as GeneratedContent;
  }

  throw new Error("OpenRouter response did not match the expected regenerated platform structure.");
}

function cleanRegeneratedPlatformContent(content: unknown, previousContent: Record<string, unknown> | null) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return content;
  }

  const fields = { ...(content as Record<string, unknown>) };
  const previousFields = previousContent ?? {};
  delete fields.platform;

  if (!("skipReason" in fields)) {
    if (typeof fields.skip_reason === "string" || fields.skip_reason === null) {
      fields.skipReason = fields.skip_reason;
    } else if (fields.recommended === true || fields.recommendedNull === null) {
      fields.skipReason = null;
    } else if (typeof previousFields.skipReason === "string" || previousFields.skipReason === null) {
      fields.skipReason = previousFields.skipReason;
    }
  }
  delete fields.skip_reason;
  delete fields.recommendedNull;

  if (typeof fields.angle === "string") {
    fields.angle = stripInternalWorkflowPhrases(fields.angle);
  }

  if (typeof fields.skipReason === "string") {
    fields.skipReason = stripInternalWorkflowPhrases(fields.skipReason);
  }

  if (fields.recommended === false) {
    fields.recommendedReason = null;
  } else if (
    fields.recommended === true &&
    (typeof fields.recommendedReason !== "string" || fields.recommendedReason.trim().length === 0) &&
    typeof previousFields.recommendedReason === "string"
  ) {
    fields.recommendedReason = previousFields.recommendedReason;
  }

  return fields;
}

function stripInternalWorkflowPhrases(value: string) {
  return value
    .replace(/user has chosen to generate despite poor fit\.?\s*/gi, "")
    .replace(/user has chosen to proceed anyway\.?\s*/gi, "")
    .replace(/user has chosen to generate anyway\.?\s*/gi, "")
    .replace(/user requested generation despite poor fit\.?\s*/gi, "")
    .replace(/user requested generation anyway\.?\s*/gi, "")
    .replace(/user forced generation\.?\s*/gi, "")
    .replace(/despite poor fit\.?\s*/gi, "")
    .replace(/best possible angle:\s*/gi, "")
    .trim();
}

function findPlatformContentByLooseKey(value: Record<string, unknown>, platform: PlatformKey) {
  const matchingEntry = Object.entries(value).find(([key]) => normalizePlatformKey(key) === platform);
  return matchingEntry?.[1] ?? null;
}

function normalizePlatformKey(platform: string): PlatformKey {
  const normalized = platform.toLowerCase().replace(/[\s_-]/g, "");

  if (
    normalized === "rednote" ||
    normalized === "xiaohongshu" ||
    normalized === "xhs" ||
    platform.includes("小红书") ||
    normalized.includes("rednote") ||
    normalized.includes("xiaohongshu")
  ) {
    return "rednote";
  }

  if (
    normalized === "thread" ||
    normalized === "threads" ||
    normalized === "x" ||
    normalized.includes("threads") ||
    normalized.includes("twitter")
  ) {
    return "threads";
  }

  if (normalized === "linkedin" || normalized === "linkedinpost" || normalized.includes("linkedin")) {
    return "linkedin";
  }

  return platform.toLowerCase() as PlatformKey;
}

function looksLikePlatformContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const fields = value as Record<string, unknown>;
  return (
    "recommended" in fields &&
    "angle" in fields &&
    ("skipReason" in fields ||
      "recommendedNull" in fields ||
      "content" in fields ||
      "caption" in fields ||
      "titleOptions" in fields ||
      "carouselSlides" in fields)
  );
}
