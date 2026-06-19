import type { GeneratedContent, PlatformKey } from "@/components/types";

export const GENERATION_SYSTEM_PROMPT = `You are a cross-platform content strategist and writer for Kelly Ong (哈喽小K). Given raw material, a theme, and context, you generate platform-specific content for RedNote (小红书), Threads, and LinkedIn.

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
- Title options: Generate exactly 3 titleOptions. Each must be 20 Chinese characters or fewer, have a genuine hook, and use a different hook type from the other two.
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
- Also suggest a topic tag for the Threads post. Threads allows only ONE topic tag per post, so the choice matters for reach. Pick a topic that is both relevant to the content AND likely to have an active audience browsing or following it. Prefer the common, standard phrasing of a topic over a niche or fragmented variant (for example, prefer a widely used tag over an obscure spelling), because the one-tag limit means the tag must match what the target audience actually searches. The tag must be 1 to 50 characters, with no periods and no ampersands. It can contain spaces. Provide one primary recommended topic plus 2 alternatives that target slightly different audiences.

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

IMPORTANT: Respond ONLY with the JSON object. No markdown backticks, no preamble, no explanation outside the JSON. Escape every double quote inside string values as \\" so the response is valid JSON.`;

export const generationToolName = "emit_crosscast_generation";

export const generationToolSchema = {
  type: "object" as const,
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
      properties: {
        rednote: {
          type: "object",
          required: [
            "recommended",
            "skipReason",
            "angle",
            "titleOptions",
            "caption",
            "hashtags",
            "carouselSlides",
            "postingTips",
          ],
          properties: platformBase({
            titleOptions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
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
          }),
        },
        threads: {
          type: "object",
          required: ["recommended", "skipReason", "angle", "content", "topicTag", "topicAlternatives", "postingTips"],
          properties: platformBase({
            content: { type: "string" },
            topicTag: { type: "string", minLength: 0, maxLength: 50 },
            topicAlternatives: { type: "array", items: { type: "string", maxLength: 50 }, minItems: 0, maxItems: 2 },
          }),
        },
        linkedin: {
          type: "object",
          required: ["recommended", "skipReason", "angle", "content", "hashtags", "postingTips"],
          properties: platformBase({
            content: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          }),
        },
      },
    },
  },
};

export function validateGeneration(value: unknown): GeneratedContent {
  const parsed = value as GeneratedContent;
  if (!parsed.contentAnalysis || !parsed.platforms) {
    throw new Error("OpenRouter response did not match the expected generation structure.");
  }

  return parsed;
}

export function normalizeGenerationPlatforms(
  generation: GeneratedContent,
  selectedPlatforms: PlatformKey[],
): GeneratedContent {
  const normalizedPlatforms: GeneratedContent["platforms"] = {};

  Object.entries(generation.platforms).forEach(([platform, content]) => {
    const normalizedPlatform = platform.toLowerCase() as PlatformKey;
    if (!selectedPlatforms.includes(normalizedPlatform)) {
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

function platformBase(extraProperties: Record<string, unknown>) {
  return {
    recommended: { type: "boolean" },
    skipReason: { type: ["string", "null"] },
    angle: { type: "string" },
    postingTips: { type: "string" },
    ...extraProperties,
  };
}
