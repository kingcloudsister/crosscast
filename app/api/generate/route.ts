import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { GeneratedContent, PlatformKey, UploadedImage } from "@/components/types";

const GENERATION_SYSTEM_PROMPT = `You are a cross-platform content strategist and writer for Kelly Ong (哈喽小K). Given raw material, a theme, and context, you generate platform-specific content for RedNote (小红书), Threads, and LinkedIn.

## CRITICAL RULE: Content-Platform Fit

Before generating, classify the content type and check this fit matrix. If a platform scores LOW or SKIP, say so explicitly and suggest a different angle or recommend skipping.

Content TypeRedNoteThreadsLinkedInAI tool tutorial / workflowPRIMARYSKIPSKIPAI prompt sharingPRIMARYOnly if very novelSKIPCareer exploration / pivot storyVideo/visual anglePRIMARYProfessional framingStartup work insight / BD learningOnly with practical anglePRIMARYPRIMARYBusiness case analysisSKIPPRIMARYPRIMARYCross-border GTM frameworkSKIPCasual versionPRIMARY"What I'm building" updatesIf includes tutorial elementPRIMARYIf includes strategic lessonChina market insight for Western audienceWrong audienceBilingual versionPRIMARYLife / personal momentsFits XHS cultureOccasionallySKIP

## Platform Specifications

### RedNote (小红书) — 哈喽小K

- Identity: 文科生闯进科技圈的真实生活 — liberal arts grad making tech accessible
- Audience wants: Specific, replicable AI workflows they can copy immediately. The HOW, not the WHY.
- Voice: Like texting a friend who asked "how did you do that?" Generous, conversational, slightly excited. Chinese primary, English for tech terms. Natural emoji use.
- Structure: Short caption (150-300字) because carousel images are the real content on XHS. Numbered steps for clarity. Include the actual prompts/screenshots descriptions.
- Energy: "我发现一个超好用的！" / "大家可以试试看"
- Hook: Bold claim or relatable problem in the title. Must include primary keyword in first 18 characters.
- Title: Under 20 characters ideal (max 30). Use ！and ？for CTR.
- Hashtags: 7-12 tags. Mix of broad (#AI工具 #效率神器) and specific (tool names). Always include tool names as hashtags.
- CTA: Natural, not commanding. "大家可以试试看" not "点赞收藏关注". Spark comments by asking a question.
- Also suggest carousel slide structure (what goes on each slide, 6-8 slides).
- Compliance: No absolute terms (最好/第一/100%), no exaggerated claims, no direct contact info, no competitor bashing.

### Threads — kellydellywelly

- Identity: Young professional figuring out cross-border GTM, startup ops, career in 20s
- Audience wants: Thinking, experience, strategic insight from doing real work. The WHY and WHAT I LEARNED, not tutorials.
- Voice: Direct, reflective, intellectually curious. Thinks out loud. Chinese primary with natural 中英混杂. More personal and unfiltered than LinkedIn.
- Structure: Text-first. Medium to long threads. Numbered points for multiple lessons. Images are supporting evidence, not primary content.
- Energy: "最近有个观察挺有意思的" / "聊了聊发现..."
- Hook: Personal anecdote or observation that pulls people in.
- Format: Can be single post or multi-post thread depending on depth.

### LinkedIn — Kelly Ong

- Identity: Asia Ops Lead & GTM @ Rentmigo — cross-border go-to-market practitioner
- Audience wants: Professional insight on cross-border GTM, China market entry, startup ops, AI-in-business strategy.
- Voice: Professional but not corporate. First-person, opinionated, real examples. English primary, Chinese for cultural context where it adds credibility. More polished than Threads — complete thoughts, cleaner structure.
- Structure: Single long-form post. Strong opening hook (first 2 lines visible before "see more"). Clean paragraphs. 150-300 words.
- Energy: "I've been thinking about X" / "Here's what I've learned from Y"
- Hook: Insight or counterintuitive claim. Must earn the "see more" click.
- Hashtags: 3-5 max, professional and relevant.

## Overlap Zone

Career exploration and personal growth stories can work cross-platform with different angles:
- RedNote angle: "我是怎么做到的 + 你也可以" (how I did it + you can too)
- Threads angle: "我学到了什么 + 我的思考" (what I learned + my reflections)
- LinkedIn angle: "Here's a framework from my experience you can apply" (packaged insight)

## Author Context

Kelly Ong, born 2002, Singaporean-Chinese. 北大元培中文系 graduate. Cofounded CoChat咖聊 (mentorship platform). Previously BD at AI security company. Now Asia Ops Lead & GTM at Rentmigo (UK proptech startup, China expansion). Her edge: genuine cross-cultural fluency, real startup experience on both sides, uses AI tools daily in actual work so tutorials come from real workflows.

## Output Format

Respond in valid JSON with this structure:

{
  "contentAnalysis": {
    "contentType": "string — what type of content this is",
    "summary": "string — one sentence summary of the raw material"
  },
  "platforms": {
    "rednote": {
      "recommended": true/false,
      "skipReason": "string or null — why to skip if not recommended",
      "angle": "string — the specific angle for this platform",
      "title": "string — the post title",
      "caption": "string — the caption/body text",
      "hashtags": ["array of hashtag strings"],
      "carouselSlides": [
        {"slideNumber": 1, "content": "what goes on this slide", "designNote": "brief layout suggestion"}
      ],
      "postingTips": "string — timing, engagement strategy"
    },
    "threads": {
      "recommended": true/false,
      "skipReason": "string or null",
      "angle": "string",
      "content": "string — the full post/thread text",
      "postingTips": "string"
    },
    "linkedin": {
      "recommended": true/false,
      "skipReason": "string or null",
      "angle": "string",
      "content": "string — the full post text",
      "hashtags": ["array of hashtag strings"],
      "postingTips": "string"
    }
  }
}

Only include platforms that were requested. For platforms you recommend skipping, still include the entry but set recommended to false, provide the skipReason, and optionally suggest an alternative angle that COULD work if the user wants to force it.

IMPORTANT: Respond ONLY with the JSON object. No markdown backticks, no preamble, no explanation outside the JSON.`;

const allowedPlatforms = new Set<PlatformKey>(["rednote", "threads", "linkedin"]);
const generationToolName = "emit_crosscast_generation";
const generationToolSchema: Tool.InputSchema = {
  type: "object",
  required: ["contentAnalysis", "platforms"],
  properties: {
    contentAnalysis: {
      type: "object",
      required: ["contentType", "summary"],
      properties: {
        contentType: { type: "string" },
        summary: { type: "string" },
      },
    },
    platforms: {
      type: "object",
      required: ["rednote", "threads", "linkedin"],
      properties: {
        rednote: {
          type: "object",
          required: ["recommended", "skipReason", "angle", "title", "caption", "hashtags", "carouselSlides", "postingTips"],
          properties: {
            recommended: { type: "boolean" },
            skipReason: { type: ["string", "null"] },
            angle: { type: "string" },
            title: { type: "string" },
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
            carouselSlides: {
              type: "array",
              items: {
                type: "object",
                required: ["slideNumber", "content", "designNote"],
                properties: {
                  slideNumber: { type: "number" },
                  content: { type: "string" },
                  designNote: { type: "string" },
                },
              },
            },
            postingTips: { type: "string" },
          },
        },
        threads: {
          type: "object",
          required: ["recommended", "skipReason", "angle", "content", "postingTips"],
          properties: {
            recommended: { type: "boolean" },
            skipReason: { type: ["string", "null"] },
            angle: { type: "string" },
            content: { type: "string" },
            postingTips: { type: "string" },
          },
        },
        linkedin: {
          type: "object",
          required: ["recommended", "skipReason", "angle", "content", "hashtags", "postingTips"],
          properties: {
            recommended: { type: "boolean" },
            skipReason: { type: ["string", "null"] },
            angle: { type: "string" },
            content: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
            postingTips: { type: "string" },
          },
        },
      },
    },
  },
};

type GenerateRequest = {
  sessionId?: string | null;
  theme?: unknown;
  rawMaterial?: unknown;
  additionalContext?: unknown;
  images?: unknown;
};

const allPlatforms: PlatformKey[] = ["rednote", "threads", "linkedin"];

type StrategyProfile = Record<string, unknown> & {
  id?: string;
  user_id?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;
    const brief = parseGenerateRequest(body);

    const strategyProfile = await loadStrategyProfile();
    const sessionId = await saveSession({
      sessionId: body.sessionId ?? null,
      theme: brief.theme,
      rawMaterial: brief.rawMaterial,
      additionalContext: brief.additionalContext,
      images: brief.images,
      selectedPlatforms: [],
      strategyProfile,
    });

    const generation = normalizeGenerationPlatforms(
      await callClaude({
        theme: brief.theme,
        rawMaterial: brief.rawMaterial,
        additionalContext: brief.additionalContext,
        images: brief.images,
        selectedPlatforms: allPlatforms,
        strategyProfile,
      }),
      allPlatforms,
    );

    const generationIds = await saveGenerations(sessionId, generation);

    return NextResponse.json({
      sessionId,
      generation: {
        ...generation,
        generationIds,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseGenerateRequest(body: GenerateRequest) {
  const theme = stringValue(body.theme).trim();
  const rawMaterial = stringValue(body.rawMaterial).trim();
  const additionalContext = stringValue(body.additionalContext).trim();
  const images = Array.isArray(body.images) ? (body.images as UploadedImage[]) : [];

  if (!theme && !rawMaterial) {
    throw new Error("Add a theme or raw material before generating.");
  }

  return {
    theme,
    rawMaterial,
    additionalContext,
    images,
  };
}

async function loadStrategyProfile(): Promise<StrategyProfile | null> {
  const { data, error } = await supabaseAdmin.from("strategy_profiles").select("*").limit(1).maybeSingle();

  if (error) {
    throw new Error(`Could not load strategy profile: ${error.message}`);
  }

  return data;
}

async function saveSession({
  sessionId,
  theme,
  rawMaterial,
  additionalContext,
  images,
  selectedPlatforms,
  strategyProfile,
}: {
  sessionId: string | null;
  theme: string;
  rawMaterial: string;
  additionalContext: string;
  images: UploadedImage[];
  selectedPlatforms: PlatformKey[];
  strategyProfile: StrategyProfile | null;
}) {
  const id = sessionId ?? crypto.randomUUID();
  const payload: Record<string, unknown> = {
    id,
    theme,
    raw_material: rawMaterial,
    additional_context: additionalContext,
    images,
    selected_platforms: selectedPlatforms,
  };

  if (strategyProfile?.user_id) {
    payload.user_id = strategyProfile.user_id;
  }

  const { error } = await supabaseAdmin.from("sessions").upsert(payload, { onConflict: "id" });

  if (error) {
    throw new Error(`Could not save session: ${error.message}`);
  }

  return id;
}

async function callClaude({
  theme,
  rawMaterial,
  additionalContext,
  images,
  selectedPlatforms,
  strategyProfile,
}: {
  theme: string;
  rawMaterial: string;
  additionalContext: string;
  images: UploadedImage[];
  selectedPlatforms: PlatformKey[];
  strategyProfile: StrategyProfile | null;
}): Promise<GeneratedContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const anthropic = new Anthropic({ apiKey });
  const initialGeneration = await requestGeneration(anthropic, {
    theme,
    rawMaterial,
    additionalContext,
    images,
    selectedPlatforms,
    strategyProfile,
  });

  try {
    return validateGeneration(initialGeneration, selectedPlatforms);
  } catch (error) {
    if (selectedPlatforms.length <= 1 || !isMissingPlatformError(error)) {
      throw error;
    }
  }

  const recoveredGenerations = await Promise.all(
    selectedPlatforms.map((platform) =>
      requestGeneration(anthropic, {
        theme,
        rawMaterial,
        additionalContext,
        images,
        selectedPlatforms: [platform],
        strategyProfile,
      }).then((generation) => validateGeneration(generation, [platform])),
    ),
  );

  const recovered = recoveredGenerations.reduce<GeneratedContent>(
    (acc, generation) => ({
      contentAnalysis: acc.contentAnalysis.contentType ? acc.contentAnalysis : generation.contentAnalysis,
      platforms: {
        ...acc.platforms,
        ...generation.platforms,
      },
    }),
    {
      contentAnalysis: initialGeneration.contentAnalysis,
      platforms: {},
    },
  );

  return validateGeneration(recovered, selectedPlatforms);
}

async function requestGeneration(
  anthropic: Anthropic,
  request: {
    theme: string;
    rawMaterial: string;
    additionalContext: string;
    images: UploadedImage[];
    selectedPlatforms: PlatformKey[];
    strategyProfile: StrategyProfile | null;
  },
) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 5000,
    temperature: 0.7,
    system: GENERATION_SYSTEM_PROMPT,
    tools: [
      {
        name: generationToolName,
        description: "Emit the Crosscast generation response as structured JSON.",
        input_schema: generationToolSchemaFor(request.selectedPlatforms),
      },
    ],
    tool_choice: {
      type: "tool",
      name: generationToolName,
    },
    messages: [
      {
        role: "user",
        content: buildUserPrompt(request),
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === generationToolName);

  if (toolUse?.type === "tool_use") {
    return validateGenerationShape(toolUse.input);
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("Claude returned an empty response.");
  }

  return parseClaudeJson(text);
}

function buildUserPrompt({
  theme,
  rawMaterial,
  additionalContext,
  images,
  selectedPlatforms,
  strategyProfile,
}: {
  theme: string;
  rawMaterial: string;
  additionalContext: string;
  images: UploadedImage[];
  selectedPlatforms: PlatformKey[];
  strategyProfile: StrategyProfile | null;
}) {
  const allPlatformsRequested = selectedPlatforms.length === allPlatforms.length;
  const requestedLabels = selectedPlatforms.join(", ");

  return JSON.stringify(
    {
      brief: {
        theme,
        rawMaterial,
        additionalContext,
        images: images.map((image) => ({
          name: image.name,
          url: image.url,
        })),
        selectedPlatforms,
        platformsToEvaluate: selectedPlatforms,
      },
      strategyProfile,
      instruction: allPlatformsRequested
        ? "Evaluate and return platform decisions for all three platforms: rednote, threads, and linkedin. The platforms object MUST include rednote, threads, and linkedin. Returning an empty platforms object is invalid. For each platform, set recommended and skipReason based on content fit; when recommended is false, still include the required platform fields with the best alternative angle."
        : `Generate and return the complete platform entry for ${requestedLabels}. The platforms object MUST include ${requestedLabels}. Returning an empty platforms object is invalid. Set recommended and skipReason based on content fit; when recommended is false, still include the required platform fields with the best alternative angle.`,
    },
    null,
    2,
  );
}

function generationToolSchemaFor(requiredPlatforms: PlatformKey[]): Tool.InputSchema {
  const schema = generationToolSchema as Record<string, unknown> & {
    properties: Record<string, unknown> & {
      platforms: Record<string, unknown>;
    };
  };

  return {
    ...schema,
    properties: {
      ...schema.properties,
      platforms: {
        ...schema.properties.platforms,
        required: requiredPlatforms,
      },
    },
  } as Tool.InputSchema;
}

function parseClaudeJson(text: string): GeneratedContent {
  const cleanText = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleanText) as unknown;

  return validateGenerationShape(parsed);
}

function validateGenerationShape(value: unknown): GeneratedContent {
  const parsed = value as GeneratedContent;
  if (!parsed.contentAnalysis || !parsed.platforms) {
    throw new Error("Claude response did not match the expected generation structure.");
  }

  return parsed;
}

function validateGeneration(value: unknown, requiredPlatforms: PlatformKey[] = allPlatforms): GeneratedContent {
  const parsed = validateGenerationShape(value);

  const missingPlatforms = requiredPlatforms.filter((platform) => !parsed.platforms[platform]);
  if (missingPlatforms.length) {
    throw new Error(`Claude response omitted platform decisions for: ${missingPlatforms.join(", ")}.`);
  }

  return parsed;
}

function isMissingPlatformError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Claude response omitted platform decisions for:");
}

function normalizeGenerationPlatforms(generation: GeneratedContent, selectedPlatforms: PlatformKey[]): GeneratedContent {
  const normalizedPlatforms: GeneratedContent["platforms"] = {};

  Object.entries(generation.platforms).forEach(([platform, content]) => {
    const normalizedPlatform = platform.toLowerCase() as PlatformKey;
    if (!allowedPlatforms.has(normalizedPlatform) || !selectedPlatforms.includes(normalizedPlatform)) {
      return;
    }

    if (normalizedPlatform === "rednote") {
      normalizedPlatforms.rednote = content as GeneratedContent["platforms"]["rednote"];
    } else if (normalizedPlatform === "threads") {
      normalizedPlatforms.threads = content as GeneratedContent["platforms"]["threads"];
    } else if (normalizedPlatform === "linkedin") {
      normalizedPlatforms.linkedin = content as GeneratedContent["platforms"]["linkedin"];
    }
  });

  return {
    ...generation,
    platforms: normalizedPlatforms,
  };
}

async function saveGenerations(sessionId: string, generation: GeneratedContent) {
  const fullRows = Object.entries(generation.platforms)
    .filter(([platform]) => allowedPlatforms.has(platform as PlatformKey))
    .map(([platform, content]) => ({
      session_id: sessionId,
      platform,
      recommended: content?.recommended ?? false,
      skip_reason: content?.skipReason ?? null,
      angle: content?.angle ?? null,
      status: "draft",
      content,
    }));

  if (!fullRows.length) return;

  const { data, error } = await supabaseAdmin.from("generations").insert(fullRows).select("id, platform");

  if (!error) {
    return rowsToGenerationIds(data);
  }

  const leanRows = fullRows.map(({ session_id, platform, status, content }) => ({
    session_id,
    platform,
    status,
    content,
  }));
  const { data: leanData, error: leanError } = await supabaseAdmin
    .from("generations")
    .insert(leanRows)
    .select("id, platform");

  if (leanError) {
    throw new Error(`Could not save generations: ${leanError.message}`);
  }

  return rowsToGenerationIds(leanData);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function rowsToGenerationIds(rows: Array<{ id: string; platform: string }> | null) {
  return (rows ?? []).reduce<Partial<Record<PlatformKey, string>>>((acc, row) => {
    if (allowedPlatforms.has(row.platform as PlatformKey)) {
      acc[row.platform as PlatformKey] = row.id;
    }
    return acc;
  }, {});
}
