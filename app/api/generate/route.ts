import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { GeneratedContent, PlatformKey, UploadedImage } from "@/components/types";
import {
  buildVisionUserContent,
  createOpenRouterChatCompletion,
  extractTextContent,
  parseJsonFromOpenRouterContent,
} from "@/lib/openrouter";
import { sanitizeGeneratedContent } from "@/lib/content-sanitizer";
import { normalizeGeneratedVariants } from "@/lib/content-variants";
import { loadRedNoteSlideSpecPrompt, normalizePlatformsShape } from "@/lib/generation-utils";

export const runtime = "nodejs";
export const maxDuration = 300;

const GENERATION_SYSTEM_PROMPT = `You are a cross-platform content strategist and writer for Kelly Ong (哈喽小K). Given raw material, a theme, and context, you generate platform-specific content for RedNote (小红书), Threads, and LinkedIn.

## HARD RULES (these override all other instructions and apply to every platform)

- The writing examples included in this prompt exist ONLY to demonstrate the user's voice, tone, rhythm, and structure. NEVER reuse their content, scenarios, topics, phrasings, or specific details in generated posts. Every post must be written fresh from the user's actual raw material for the current request. For instance, if an example discusses a BD consultant, Uber, or a coffee chat, never write about those subjects unless they genuinely appear in the user's actual raw material. The examples teach HOW the user writes, never WHAT to write about.

- NEVER use em-dashes (the — character, or the Chinese —— ) anywhere in any generated content. Use commas, periods, or separate sentences instead.

- NEVER include confidential or specific business details in generated content. This includes partner names, partner types, client or company names, specific deal details, internal metrics, dollar figures, or any proprietary business information, EVEN IF that information appears in uploaded images or in the raw material. Use uploaded images and raw material ONLY to understand context. In the output, always abstract specifics into generic terms. For example, write "不同类型的partner" rather than listing the actual partner types, or "一个合作方" rather than naming a specific partner. Anything visible in a screenshot such as names, logos, or figures must never be transcribed into the post. When uncertain whether something is confidential, genericize it.

## CRITICAL RULE: Content-Platform Fit

Before generating, classify the content type and check this fit matrix. If a platform scores LOW or SKIP, say so explicitly and suggest a different angle or recommend skipping.

Content TypeRedNoteThreadsLinkedInAI tool tutorial / workflowPRIMARYSKIPSKIPAI prompt sharingPRIMARYOnly if very novelSKIPCareer exploration / pivot storyVideo/visual anglePRIMARYProfessional framingStartup work insight / BD learningOnly with practical anglePRIMARYPRIMARYBusiness case analysisSKIPPRIMARYPRIMARYCross-border GTM frameworkSKIPCasual versionPRIMARY"What I'm building" updatesIf includes tutorial elementPRIMARYIf includes strategic lessonChina market insight for Western audienceWrong audienceBilingual versionPRIMARYLife / personal momentsFits XHS cultureOccasionallySKIP

## Platform Specifications

RedNote (小红书) voice specification.

Identity: 文科生闯进科技圈 — a liberal arts grad making AI/tech accessible. Audience wants specific, copyable workflows they can save and try.

Voice rules (follow precisely):
1. Understated excitement, never hype. Write like a friend who's genuinely a little surprised something worked: 意外地有用, 挺惊喜的, 效果还挺好的. NEVER use marketing hype, multiple exclamation marks, or overselling words like 超级/绝绝子/神器 in the body. The calm honesty is what makes it trustworthy.
2. Open with a hook — either a concrete relatable pain or a bold claim. Pain example: 我之前每天早上起床第一件事，就是打开Slack、Gmail、Linear一个个看，光翻消息就要半小时以上，还经常漏东西 (note the specific number — this is what makes it relatable). Bold claim example: PPT已经out了，我把pitch做成了网页.
3. Tell a little story, do NOT summarize. Structure: the pain/situation → what you did → the before/after transformation → specific "wow" details → honest texture → reader call-out. The post must have narrative texture, not be a compressed feature list. LENGTH: substantial, 300-600字 is normal. Do NOT produce short summarized captions.
4. Include specific "wow" moments. The concrete surprising detail makes people want to try it: 如果我之前在Slack说过"我等下去做"，但一直没做，它也会帮我抓出来提醒我.
5. Include honest texture. Admit effort and imperfection: 我自己大概调了2-3小时才到现在这个效果. This builds trust. Don't present things as effortless or perfect.
6. Close by addressing the reader directly + a soft engagement invite. Example: 如果你也是每天在各种工作流里切来切去的人，这个可以试试看！ and optionally （如果有人想看我怎么写prompt，我可以整理一下）.
7. Code-switching (Chinese is always the base language):
- Keep in English ONLY the words that bilingual Chinese speakers genuinely default to in English: product and tool names (Slack, Gmail, Claude, Codex, Notion), tech acronyms and product categories (AI, CRM, API, BD, GTM, SOP, KPI), and a small set of terms naturally said in English in this context (prompt, pipeline, startup, launch).
- Localize everything else to natural Chinese, including common business or everyday words that have a natural Chinese equivalent. For example, "partner" should become 合作伙伴 or 合作方, not stay as "partner."
- CRITICAL: do NOT mechanically carry English words from the user's theme or raw material into the output just because the user typed them in English. The user's input language is convenience shorthand. Judge each word independently: would a native bilingual Chinese speaker naturally say this word in Chinese or in English in casual conversation? Write it the way they would actually say it. A product category like CRM stays English; a common noun like partner becomes 合作伙伴/合作方.
- When unsure, prefer the natural Chinese word over keeping the English one.
8. Emoji: sparing and natural. A 👍🏻 occasionally, numbered emoji (1️⃣2️⃣) for steps, occasional 💡🔧❓ for structure. Not decorative spam.

RedNote title rules:

- Generate exactly 3 title options. Each title option must be 20 Chinese characters (字) or fewer, counting every character including letters, punctuation, and emoji. Never exceed 20.

- Being short is NOT permission to be flat. Within those 20 characters the title MUST contain a hook. A flat description of what the post is about is a FAILED title even if it is short and clear. Example of a FAILED title: "我给自己做了个CRM" (just states what was done, no hook, no reason to tap).

- Every title option must use at least one of these hook types, built from the actual topic of THIS post:
  1. Provocative callout or question to the audience. Example pattern: "做BD还在用Excel管partner？"
  2. Pain relief or benefit. Example pattern: "再也不用在Excel里翻partner了"
  3. Relatable pain plus solution. Example pattern: "partner太多记不住？我做了个CRM"
  4. Bold or provocative claim. Example pattern: "PPT已经out了"
  5. Benefit tease with a concrete outcome. Example pattern: "手写plog图片轻松get"

- The 3 title options must use DIFFERENT hook types from each other, so the user gets a real choice across approaches, not minor wording variations of the same idea. For example: option 1 a provocative callout or question, option 2 a pain-relief or benefit angle, option 3 a curiosity gap or bold claim.

- Each title option must sound like the user genuinely wrote it. Never use clickbait or hype words such as 超强, 必看, 绝绝子, or 神器.

- These example titles demonstrate the HOOK PATTERNS only. Do NOT copy them literally. Build a hook of the same type from the user's real raw material for this specific post.

- Before returning titleOptions, self-check every option: (a) Is it within 20 characters including punctuation and emoji? (b) Does it have a genuine hook rather than just describing the post? (c) Does it use a different hook type from the other two options? If an option reads like a flat statement or repeats another option's hook type, rewrite it before returning it.

Anti-patterns (never do these): marketing hype or exclamation-heavy enthusiasm; compressing into a short summary or feature list; stripping out personal/honest texture; generic openings that don't name a specific pain or make a specific claim; over-salting with English.

IMPORTANT: The following examples are ONLY to teach voice and style. Do NOT reuse their topics, scenarios, phrasings, or content. Generate entirely from the user's actual raw material for this post.

Real examples of the user's RedNote voice — study the rhythm, length, and texture, match this style (do not copy content):

Example 1:
前几天用Claude做了一个小tool，结果意外地有用，想分享一下👍🏻
我之前每天早上起床第一件事，就是打开Slack、Gmail、Linear一个个看，光翻消息就要半小时以上，还经常漏东西；所以我在Claude的Cowork里做了一个scheduled task，让它每天早上自动帮我扫过去24小时的消息。
现在的状态是：我醒来直接打开手机，今天要做什么已经帮我整理好了。它不是那种简单summary，而是会直接帮我整理成to-do list，并且分好优先级；整理好后会给我的slack发一条信息overview，然后同步直接写入我的journal app 里面（这里我用的是heptabase）
甚至可以做到的很厉害的一点是：如果我之前在Slack说过"我等下去做"，但一直没做，它也会帮我抓出来提醒我。
用了几天下来最大的感受是不太会漏事了，每天早晨也可以更快速的做好工作准备进入工作状态！
setup其实不复杂，就是写prompt + 连一下Slack、Gmail这些，我自己大概调了2-3小时才到现在这个效果。如果你也是每天在各种工作流里切来切去的人，这个可以试试看！
（如果有人想看我怎么写prompt，我可以整理一下）

Example 2:
PPT已经out了，我把pitch做成了网页
最近在给合作伙伴准备一个 briefing session，本来想做 PPT，后来试了一下直接让 AI 做成 HTML 页面；做完之后我发现，有些 pitch / 产品介绍，其实不一定非要用 PPT。
如果做成PPT，当然也可以，但我想要它更像一个interactive briefing page：可以切换语言，可以按session flow推进。
所以我直接用 Claude Code / Codex 做了一个 presentation HTML，效果还挺惊喜的，视觉上比普通PPT更直观，也更适合发给partner提前看！
最近越来越觉得，AI真正有用的地方不是炫技，而是把这些很琐碎的工作流变得更顺。

Example 3:
上次分享了我用 Claude 做的上班 todo 助手，没想到好多人来问怎么设置，所以整理了一份完整攻略！
简单说就是 5 步：
1️⃣ 连好你的connectors信息源（Slack、Gmail 这些，在设置里点几下就行）
2️⃣ 在 Cowork 里创建一个 scheduled task
3️⃣ 写 prompt（这步最关键）
4️⃣ 设好自动运行时间，让它每天定时跑
5️⃣ 先用起来，再根据输出慢慢调
🔧 关于 prompt 怎么越调越好用：不要想着一次写到完美，先跑起来，然后每天花 1 分钟看看输出哪里不对劲，针对性地改。
有问题评论区问我就好～也欢迎分享你们做出来的版本！

Threads voice specification.

Identity: Young professional figuring out cross-border GTM, startup ops, career in your 20s. Audience wants quality thinking and real insight (有质量的分享), not tutorials.

Voice rules (follow precisely):
1. Open with a CONCRETE SPECIFIC real situation — never a generic hook. Every post starts grounded in something real the user did, saw, or learned. Examples: 刚看了一个视频，采访了一个Uber还在startup时期负责China Growth的团队成员 / 和公司在英国的BD consultant聊完了，他说他觉得很惊讶的事情是 / 前两天coffee chat了Susie，她是专门给startup做SEO optimization的. The specificity IS the hook. NEVER open with "Have you ever...", "我一直在想...", "最近发现一个有趣的现象", or any generic framing.
2. Every claim must carry specific evidence. This is what makes it 有质量 vs generic. Not "Uber struggled in China" but the $1B Apple investment in Didi as a signal, the 微信钱包 integration, the channel lockout. Use real numbers, names, concrete facts. If a point has no specific evidence, cut it or find the evidence.
3. Apply a clear analytical lens. Frame observations through a sharp angle: 中美公司在早期的运营思维差异, 渠道即壁垒. Give the reader a framework, not just facts.
4. Use numbered points (1/ 2/ 3/) for multi-part analysis. Each point: a clear thesis line, then evidence and reasoning.
5. Close by zooming out to a transferable principle. Connect the specific story to something broader: 其实放到现在依然很applicable，对于很多想要打入中国市场的外企而言...
6. Code-switching (Chinese is always the base language):
- Keep in English ONLY the words that bilingual Chinese speakers genuinely default to in English: product and tool names (Slack, Gmail, Claude, Codex, Notion), tech acronyms and product categories (AI, CRM, API, BD, GTM, SOP, KPI), and a small set of terms naturally said in English in this context (prompt, pipeline, startup, launch).
- Localize everything else to natural Chinese, including common business or everyday words that have a natural Chinese equivalent. For example, "partner" should become 合作伙伴 or 合作方, not stay as "partner."
- CRITICAL: do NOT mechanically carry English words from the user's theme or raw material into the output just because the user typed them in English. The user's input language is convenience shorthand. Judge each word independently: would a native bilingual Chinese speaker naturally say this word in Chinese or in English in casual conversation? Write it the way they would actually say it. A product category like CRM stays English; a common noun like partner becomes 合作伙伴/合作方.
- When unsure, prefer the natural Chinese word over keeping the English one.
7. Voice register: reflective and intellectually curious, thinking-out-loud, but substantive. More personal and raw than LinkedIn, but every post earns its place with real insight.
8. Also suggest a topic tag for the Threads post. Threads allows only ONE topic tag per post, so the choice matters for reach. Pick a topic that is both relevant to the content AND likely to have an active audience browsing or following it. Prefer the common, standard phrasing of a topic over a niche or fragmented variant (for example, prefer a widely used tag over an obscure spelling), because the one-tag limit means the tag must match what the target audience actually searches. The tag must be 1 to 50 characters, with no periods and no ampersands. It can contain spaces. Provide one primary recommended topic plus 2 alternatives that target slightly different audiences.

Anti-patterns (never do these): generic or cliché hooks ("Have you ever wondered", "最近发现", "Here's something interesting"); shallow observations stated as insight without specific evidence; LinkedIn-style polish or corporate tone; abstract generalities any AI could write; starting anywhere other than a concrete real situation.

IMPORTANT: The following examples are ONLY to teach voice and style. Do NOT reuse their topics, scenarios, phrasings, or content. Generate entirely from the user's actual raw material for this post.

Real examples of the user's Threads voice — study how each opens with a concrete anchor and backs every claim with specific evidence, match this (do not copy content):

Example 1:
刚看了一个视频，采访了一个Uber还在startup时期负责China Growth的团队成员，分享了Uber为什么最终把Uber China卖给滴滴的故事，几个点很值得分享：

1/ 中美公司在早期的运营思维差异
中国公司从一开始就非常重运营，早期就把用户激励体系（优惠券怎么发、怎么裂变）、反欺诈机制想清楚了；而美国公司的思维通常是先把产品做出来，等规模铺开了再去补运营细节；这个差异在中国市场的激烈竞争中被放大得非常明显

2/ 让Uber真正意识到打不下去了的wake up call，是apple投给滴滴的$1B
当时Apple在全球几乎没有对任何公司做过这个量级的战略投资，这个信号非常强烈。它让Uber意识到：他们表面上是在和滴滴打，但本质上是在和滴滴背后的整个全球投资者打（SoftBank、Apple、腾讯、阿里）

3/ 渠道即壁垒
在中国最高效的传播渠道就是微信，但腾讯是滴滴最大的投资方之一。滴滴的优惠券在微信生态里传播毫无障碍，甚至直接嵌入了微信钱包；而Uber一直被封，被彻底挡在了中国最大的流量入口外面。

其实放到现在依然很applicable，对于很多想要打入中国市场的外企而言，难度不是产品不好，而是中国市场的竞争维度完全不同：运营深度、资本博弈、生态封锁，每一层都是独立的战场。

Example 2:
和公司在英国的BD consultant聊完了，他说他觉得很惊讶的事情，是我在没有做任何的产品live demo的情况下，签下了2家大公司的合作还有3家公司在pipeline中准备签约

聊了聊发现中国市场的BD方式和技巧我觉得和UK很不一样，中国市场有很多可以play around 的nuances 以及渠道，逐渐发现自己掌握了一些方法和自己的SOP👍🏻

Example 3:
前两天coffee chat了Susie，她是专门给startup做SEO optimization的，因为我们公司快launch产品了，想问问她对我们做SEO的建议。

一个key insight：现在的中国其实没有传统意义上的SEO，小红书已经替代成为了大家的搜索引擎。大部分中国用户现在找信息的第一直觉不是百度，而是直接上小红书搜索关键词。所以对于主打中国市场的business来说，小红书不只是发内容的地方，更要被重视成"搜索引擎阵地"。

她也分享了传统SEO的底层逻辑（适用于英文/Google端）：
1/ 在landing page的header要埋入目标关键词（要先洞察users会搜哪些词）
2/ 不只看主页，子页面的hero section也要做关键词布局
3/ 专注找那些用户会搜但还没被大公司垄断的词

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

Angle field rule: keep every "angle" concise. It should be a short strategic label or phrase, ideally 6-14 words, never a full paragraph.

{
  "contentAnalysis": {
    "contentType": "string — what type of content this is",
    "summary": "string — one sentence summary of the raw material",
    "projectTitle": "string — a short, specific project name in the source language; 3-8 English words or 6-16 Chinese characters"
  },
  "platforms": {
    "rednote": {
      "recommended": true/false,
      "recommendedReason": "string or null — if recommended, 1-2 short lines explaining why this platform fits; null if not recommended",
      "skipReason": "string or null — why to skip if not recommended",
      "angle": "string — the specific angle for this platform",
      "titleOptions": ["exactly 3 title option strings, each under 20 Chinese characters and using a different hook type"],
      "caption": "string — the caption/body text",
      "hashtags": ["array of hashtag strings"],
      "carouselSlides": [
        {"slideNumber": 1, "content": "what goes on this slide", "designNote": "brief layout suggestion"}
      ],
      "postingTips": "string — timing, engagement strategy"
    },
    "threads": {
      "recommended": true/false,
      "recommendedReason": "string or null — if recommended, 1-2 short lines explaining why this platform fits; null if not recommended",
      "skipReason": "string or null",
      "angle": "string",
      "content": "string — the full post/thread text",
      "topicTag": "string — the single primary recommended Threads topic tag, 1-50 characters, no periods, no ampersands",
      "topicAlternatives": ["exactly 2 alternative Threads topic tag strings, each 1-50 characters, no periods, no ampersands"],
      "postingTips": "string"
    },
    "linkedin": {
      "recommended": true/false,
      "recommendedReason": "string or null — if recommended, 1-2 short lines explaining why this platform fits; null if not recommended",
      "skipReason": "string or null",
      "angle": "string",
      "content": "string — the full post text",
      "hashtags": ["array of hashtag strings"],
      "postingTips": "string"
    }
  }
}

Only include platforms that were requested. For platforms you recommend, set recommendedReason to 1-2 concise lines explaining why this platform fits the brief. For platforms you recommend skipping, set recommended to false, recommendedReason to null, provide the skipReason, and optionally suggest an alternative angle that COULD work if the user wants to force it.

## Phase 3 variant contract

For every recommended platform, do not return a single draft at the platform root. Return exactly 3 complete, meaningfully different variants under the variants field. All three variants must express the same core narrative and goal, but use distinct hooks, structures, or levels of directness. Each item must use this shape:

{"id":"variant-1","label":"2-4 word human-readable strategy name","rationale":"one concise sentence explaining the tradeoff","content":{"angle":"...","all other complete platform-specific fields":"..."}}

Use stable ids variant-1, variant-2, and variant-3. Also return recommendedVariantId at the platform root and choose the strongest option for that platform and audience. The platform root still contains recommended, recommendedReason, and skipReason; those decision fields do not need to be repeated inside each variant content. For a skipped platform, return no variants and follow the empty-draft rules above.

IMPORTANT: Respond ONLY with the JSON object. No markdown backticks, no preamble, no explanation outside the JSON. Escape every double quote inside string values as \\" so the response is valid JSON.`;

const allowedPlatforms = new Set<PlatformKey>(["rednote", "threads", "linkedin"]);

type GenerateRequest = {
  sessionId?: string | null;
  theme?: unknown;
  rawMaterial?: unknown;
  additionalContext?: unknown;
  images?: unknown;
  selectedPlatforms?: unknown;
  platformsToGenerate?: unknown;
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
      selectedPlatforms: brief.selectedPlatforms,
      strategyProfile,
    });

    const generatedContent = sanitizeGeneratedContent(
      removeSkippedPlatformDrafts(
        normalizeVariantSets(
          normalizeGenerationPlatforms(
            await callOpenRouter({
              theme: brief.theme,
              rawMaterial: brief.rawMaterial,
              additionalContext: brief.additionalContext,
              images: brief.images,
              selectedPlatforms: brief.platformsToGenerate,
              strategyProfile,
            }),
            brief.platformsToGenerate,
          ),
        ),
      ),
    );

    const projectTitle = resolveProjectTitle(
      brief.theme,
      generatedContent.contentAnalysis.projectTitle,
      generatedContent.contentAnalysis.summary,
      brief.rawMaterial,
    );
    const generation: GeneratedContent = {
      ...generatedContent,
      contentAnalysis: {
        ...generatedContent.contentAnalysis,
        projectTitle,
      },
    };

    if (projectTitle !== brief.theme) {
      await saveSession({
        sessionId,
        theme: projectTitle,
        rawMaterial: brief.rawMaterial,
        additionalContext: brief.additionalContext,
        images: brief.images,
        selectedPlatforms: brief.selectedPlatforms,
        strategyProfile,
      });
    }

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
  const selectedPlatforms = parsePlatforms(body.selectedPlatforms, allPlatforms);
  const platformsToGenerate = parsePlatforms(body.platformsToGenerate, selectedPlatforms);

  if (!theme && !rawMaterial) {
    throw new Error("Add a theme or raw material before generating.");
  }

  if (!selectedPlatforms.length) {
    throw new Error("Choose at least one platform before generating.");
  }

  if (!platformsToGenerate.length) {
    throw new Error("Choose a platform to generate.");
  }

  if (platformsToGenerate.some((platform) => !selectedPlatforms.includes(platform))) {
    throw new Error("A generated platform must also be selected for this session.");
  }

  return {
    theme,
    rawMaterial,
    additionalContext,
    images,
    selectedPlatforms,
    platformsToGenerate,
  };
}

function parsePlatforms(value: unknown, fallback: PlatformKey[]): PlatformKey[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.filter((platform): platform is PlatformKey => typeof platform === "string" && allowedPlatforms.has(platform as PlatformKey))),
  );
}

function resolveProjectTitle(theme: string, candidate: string | undefined, summary: string, rawMaterial: string) {
  const existingTheme = cleanProjectTitle(theme);
  const isProvisional = existingTheme === "Naming this project..." || existingTheme === "Naming this project…";

  if (existingTheme && !isProvisional && existingTheme.length <= 72) {
    return existingTheme;
  }

  const generatedTitle = cleanProjectTitle(candidate ?? "");
  if (generatedTitle) return generatedTitle.slice(0, 72);

  const fallback = cleanProjectTitle(summary || rawMaterial.split("\n").find((line) => line.trim()) || "New content project");
  return fallback.length > 64 ? `${fallback.slice(0, 61).trim()}…` : fallback;
}

function cleanProjectTitle(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’。.!！?？:：]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

async function callOpenRouter({
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
  const initialGeneration = normalizeGenerationPlatforms(
    await requestGeneration({
      theme,
      rawMaterial,
      additionalContext,
      images,
      selectedPlatforms,
      strategyProfile,
    }),
    selectedPlatforms,
  );
  const missingPlatforms = getMissingPlatforms(initialGeneration, selectedPlatforms);

  if (!missingPlatforms.length) {
    return initialGeneration;
  }

  const recoveredGenerations = await Promise.allSettled(
    missingPlatforms.map((platform) =>
      requestGeneration({
        theme,
        rawMaterial,
        additionalContext,
        images,
        selectedPlatforms: [platform],
        strategyProfile,
      }).then((generation) => normalizeGenerationPlatforms(generation, [platform])),
    ),
  );

  const recovered = recoveredGenerations.reduce<GeneratedContent>(
    (acc, result) => {
      if (result.status !== "fulfilled") {
        return acc;
      }

      return {
        contentAnalysis: acc.contentAnalysis.contentType ? acc.contentAnalysis : result.value.contentAnalysis,
        platforms: {
          ...acc.platforms,
          ...result.value.platforms,
        },
      };
    },
    initialGeneration,
  );

  return fillMissingPlatforms(recovered, selectedPlatforms);
}

async function requestGeneration(
  request: {
    theme: string;
    rawMaterial: string;
    additionalContext: string;
    images: UploadedImage[];
    selectedPlatforms: PlatformKey[];
    strategyProfile: StrategyProfile | null;
  },
) {
  const userContent = buildVisionUserContent(buildUserPrompt(request), request.images);
  logOpenRouterVisionRequest(userContent);

  // Must fit all three platform drafts plus RedNote slide specs; headroom is cheap
  // because output tokens are billed only as produced.
  const response = await createOpenRouterChatCompletion({
    maxTokens: 30000,
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
  console.log("[OpenRouter] Raw chat completion response:", JSON.stringify(response, null, 2));
  console.log("[OpenRouter] Raw message.content:", text);

  if (!text) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return parseOpenRouterJson(text);
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
        })),
        selectedPlatforms,
        platformsToEvaluate: selectedPlatforms,
      },
      strategyProfile,
      instruction: `${allPlatformsRequested ? "Evaluate and return all three platforms: rednote, threads, and linkedin." : `Generate and return the complete platform entry for ${requestedLabels}.`} Create contentAnalysis.projectTitle as a short, specific project name in the source language: 3-8 English words or 6-16 Chinese characters, with no trailing punctuation. The platforms object MUST include every requested platform. For each recommended platform, return exactly three complete variants using the Phase 3 variant contract, choose recommendedVariantId, and make the variants meaningfully different while preserving the same narrative and goal. For every RedNote variant, return exactly 3 titleOptions. For every Threads variant, return topicTag plus exactly 2 topicAlternatives. Keep every angle concise. When recommended is false, set recommendedReason to null and do not generate publish-ready variants.`,
    },
    null,
    2,
  );
}

function logOpenRouterVisionRequest(content: ReturnType<typeof buildVisionUserContent>) {
  console.log(
    "[OpenRouter] Vision request content blocks:",
    content.map((block) => {
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
}

function parseOpenRouterJson(text: string): GeneratedContent {
  const parsed = normalizePlatformsShape(parseJsonFromOpenRouterContent(text));
  return validateGenerationShape(parsed);
}

function validateGenerationShape(value: unknown): GeneratedContent {
  const parsed = value as GeneratedContent;
  if (!parsed.contentAnalysis || !parsed.platforms) {
    throw new Error("OpenRouter response did not match the expected generation structure.");
  }

  return parsed;
}

function validateGeneration(value: unknown, requiredPlatforms: PlatformKey[] = allPlatforms): GeneratedContent {
  const parsed = validateGenerationShape(value);

  const missingPlatforms = getMissingPlatforms(parsed, requiredPlatforms);
  if (missingPlatforms.length) {
    throw new Error(`OpenRouter response omitted platform decisions for: ${missingPlatforms.join(", ")}.`);
  }

  return parsed;
}

function normalizeGenerationPlatforms(generation: GeneratedContent, selectedPlatforms: PlatformKey[]): GeneratedContent {
  const normalizedPlatforms: GeneratedContent["platforms"] = {};
  const platformEntries = Object.entries(generation.platforms);

  if (selectedPlatforms.length === 1 && looksLikePlatformContent(generation.platforms)) {
    const [platform] = selectedPlatforms;
    return {
      ...generation,
      platforms: assignPlatformContent({}, platform, generation.platforms),
    };
  }

  platformEntries.forEach(([platform, content]) => {
    const normalizedPlatform = normalizePlatformKey(platform);
    if (!allowedPlatforms.has(normalizedPlatform) || !selectedPlatforms.includes(normalizedPlatform)) {
      return;
    }

    assignPlatformContent(normalizedPlatforms, normalizedPlatform, content);
  });

  if (selectedPlatforms.length === 1 && !normalizedPlatforms[selectedPlatforms[0]] && platformEntries.length === 1) {
    const [platform] = selectedPlatforms;
    assignPlatformContent(normalizedPlatforms, platform, platformEntries[0][1]);
  }

  return {
    ...generation,
    platforms: normalizedPlatforms,
  };
}

function normalizeVariantSets(generation: GeneratedContent): GeneratedContent {
  const platforms: GeneratedContent["platforms"] = {};

  Object.entries(generation.platforms).forEach(([platform, content]) => {
    if (!content || !allowedPlatforms.has(platform as PlatformKey)) return;
    const normalized = normalizeGeneratedVariants(platform as PlatformKey, content);
    if (normalized.recommended && normalized.variants?.length !== 3) {
      throw new Error(`OpenRouter must return exactly 3 variants for recommended platform: ${platform}.`);
    }
    assignPlatformContent(platforms, platform as PlatformKey, normalized);
  });

  return { ...generation, platforms };
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

function assignPlatformContent(
  platforms: GeneratedContent["platforms"],
  platform: PlatformKey,
  content: unknown,
): GeneratedContent["platforms"] {
  if (platform === "rednote") {
    platforms.rednote = content as GeneratedContent["platforms"]["rednote"];
  } else if (platform === "threads") {
    platforms.threads = content as GeneratedContent["platforms"]["threads"];
  } else if (platform === "linkedin") {
    platforms.linkedin = content as GeneratedContent["platforms"]["linkedin"];
  }

  return platforms;
}

function looksLikePlatformContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const fields = value as Record<string, unknown>;
  return "recommended" in fields && "skipReason" in fields && "angle" in fields;
}

function getMissingPlatforms(generation: GeneratedContent, requiredPlatforms: PlatformKey[]) {
  return requiredPlatforms.filter((platform) => !generation.platforms[platform]);
}

function fillMissingPlatforms(generation: GeneratedContent, requiredPlatforms: PlatformKey[]): GeneratedContent {
  const platforms = { ...generation.platforms };

  getMissingPlatforms(generation, requiredPlatforms).forEach((platform) => {
    if (platform === "rednote") {
      platforms.rednote = {
        recommended: false,
        recommendedReason: null,
        skipReason: "OpenRouter omitted the RedNote draft after retry. Generate again to request this platform specifically.",
        angle: "Needs regeneration for RedNote.",
        titleOptions: ["需要重新生成"],
        caption: "OpenRouter 没有返回小红书版本，请重新生成这一平台。",
        hashtags: [],
        carouselSlides: [],
        postingTips: "Regenerate this platform before posting.",
      };
      return;
    }

    if (platform === "threads") {
      platforms.threads = {
        recommended: false,
        recommendedReason: null,
        skipReason: "OpenRouter omitted the Threads draft after retry. Generate again to request this platform specifically.",
        angle: "Needs regeneration for Threads.",
        content: "OpenRouter did not return a Threads draft for this run. Regenerate this platform before posting.",
        topicTag: "",
        topicAlternatives: [],
        postingTips: "Regenerate this platform before posting.",
      };
      return;
    }

    platforms.linkedin = {
      recommended: false,
      recommendedReason: null,
      skipReason: "OpenRouter omitted the LinkedIn draft after retry. Generate again to request this platform specifically.",
      angle: "Needs regeneration for LinkedIn.",
      content: "OpenRouter did not return a LinkedIn draft for this run. Regenerate this platform before posting.",
      hashtags: [],
      postingTips: "Regenerate this platform before posting.",
    };
  });

  return {
    ...generation,
    platforms,
  };
}

function removeSkippedPlatformDrafts(generation: GeneratedContent): GeneratedContent {
  const platforms: GeneratedContent["platforms"] = {};

  Object.entries(generation.platforms).forEach(([platform, content]) => {
    if (!allowedPlatforms.has(platform as PlatformKey) || !content) {
      return;
    }

    const platformKey = platform as PlatformKey;
    const skipReason = content.skipReason ?? "This platform is not recommended for this brief.";

    if (content.recommended) {
      assignPlatformContent(platforms, platformKey, content);
      return;
    }

    if (platformKey === "rednote") {
      platforms.rednote = {
        recommended: false,
        recommendedReason: null,
        skipReason,
        angle: content.angle ?? "Not recommended for this brief.",
        titleOptions: [],
        caption: "",
        hashtags: [],
        carouselSlides: [],
        postingTips: "",
      };
      return;
    }

    if (platformKey === "threads") {
      platforms.threads = {
        recommended: false,
        recommendedReason: null,
        skipReason,
        angle: content.angle ?? "Not recommended for this brief.",
        content: "",
        topicTag: "",
        topicAlternatives: [],
        postingTips: "",
      };
      return;
    }

    platforms.linkedin = {
      recommended: false,
      recommendedReason: null,
      skipReason,
      angle: content.angle ?? "Not recommended for this brief.",
      content: "",
      hashtags: [],
      postingTips: "",
    };
  });

  return {
    ...generation,
    platforms,
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
