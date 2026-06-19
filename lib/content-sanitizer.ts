import type { GeneratedContent, PlatformKey } from "@/components/types";

const forbiddenTitlePhrases = ["超强", "必看", "必备", "绝绝子", "神器"];

export function sanitizeGeneratedContent(generation: GeneratedContent): GeneratedContent {
  const platforms: GeneratedContent["platforms"] = {};

  Object.entries(generation.platforms).forEach(([platform, content]) => {
    if (!content) return;
    const platformKey = platform as PlatformKey;
    platforms[platformKey] = sanitizePlatformContent(platformKey, content) as never;
  });

  return {
    ...generation,
    platforms,
  };
}

export function sanitizePlatformContent<T>(platform: PlatformKey, content: T): T {
  const sanitized = sanitizeValue(content, platform) as T;

  if (platform === "rednote" && sanitized && typeof sanitized === "object") {
    const rednoteContent = sanitized as Record<string, unknown>;
    const titleOptions = Array.isArray(rednoteContent.titleOptions)
      ? rednoteContent.titleOptions
          .filter((title): title is string => typeof title === "string")
          .map((title) => sanitizeRedNoteTitle(title))
          .filter(Boolean)
      : [];
    const legacyTitle = typeof rednoteContent.title === "string" ? sanitizeRedNoteTitle(rednoteContent.title) : "";
    const normalizedTitleOptions = Array.from(new Set(titleOptions.length ? titleOptions : legacyTitle ? [legacyTitle] : []));

    return {
      ...rednoteContent,
      ...(legacyTitle ? { title: legacyTitle } : {}),
      ...(normalizedTitleOptions.length ? { titleOptions: normalizedTitleOptions.slice(0, 3) } : {}),
    } as T;
  }

  if (platform === "threads" && sanitized && typeof sanitized === "object") {
    const threadsContent = sanitized as Record<string, unknown>;
    const isRecommended = Boolean(threadsContent.recommended);
    const fallbackTopics = inferThreadsTopicFallbacks(threadsContent);
    const topicTag = sanitizeThreadsTopic(
      typeof threadsContent.topicTag === "string" ? threadsContent.topicTag : "",
    ) || (isRecommended ? fallbackTopics[0] : "");
    const modelAlternatives = Array.isArray(threadsContent.topicAlternatives)
      ? threadsContent.topicAlternatives
          .filter((topic): topic is string => typeof topic === "string")
          .map((topic) => sanitizeThreadsTopic(topic))
          .filter(Boolean)
      : [];
    const topicAlternatives = isRecommended
      ? fillThreadsTopicAlternatives(topicTag, modelAlternatives, fallbackTopics)
      : modelAlternatives.slice(0, 2);

    return {
      ...threadsContent,
      topicTag,
      topicAlternatives,
    } as T;
  }

  return sanitized;
}

function sanitizeValue(value: unknown, platform: PlatformKey): unknown {
  if (typeof value === "string") {
    return sanitizeText(value, platform);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, platform));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, platform)]));
  }

  return value;
}

function sanitizeText(value: string, platform: PlatformKey) {
  let next = value.replace(/——|—/g, "，");
  const hasBusinessContext = /partner|合作方|pipeline|dashboard|CRM|BD|deal|client|company|客户|合作|阶段/i.test(next);

  if (platform === "rednote" || platform === "threads") {
    next = next
      .replace(/\bfollow\s*ups?\b/gi, "跟进")
      .replace(/\bpartners?\b/gi, "合作方");
  }

  if (hasBusinessContext) {
    next = next
      .replace(/\$[\d,.]+[A-Za-z万亿百万千]*/g, "一个具体金额")
      .replace(
        /(?:学生组织|中介机构|个人代理|渠道方|代理|机构)(?:\s*[\/、,，]\s*(?:学生组织|中介机构|个人代理|渠道方|代理|机构))*/g,
        "不同类型的合作方",
      )
      .replace(/\b\d+(?:[\/,，]\d+)+\b/g, "若干")
      .replace(/\b\d+(?:-\d+)?\s*(?=total|不同阶段|dashboard|partners?|partner|pending|active|outreach)/gi, "若干")
      .replace(/\b\d+(?:\.\d+)?\s*(?:total\s+partners|partners?|pending\s+confirmation|pending|active|outreach)\b/gi, "若干")
      .replace(/\b\d+(?:\.\d+)?\s*(?=个|家|位|条|轮|类)/g, "若干")
      .replace(/\b(?:Outreach|Deck Sent|Active|Pending Confirmation|Pending|Potential|Prospect)\b/gi, "不同阶段");
  }

  if (platform === "rednote") {
    forbiddenTitlePhrases.forEach((phrase) => {
      next = next.replaceAll(phrase, "");
    });
  }

  return next;
}

function sanitizeRedNoteTitle(title: string) {
  let next = sanitizeText(title, "rednote").trim();

  forbiddenTitlePhrases.forEach((phrase) => {
    next = next.replaceAll(phrase, "");
  });

  next = next
    .replace(/[!！?？,，。:：;；\s]+$/g, "")
    .replace(/^[!！?？,，。:：;；\s]+/g, "")
    .replace(/\s+/g, "");

  const truncated = Array.from(next).slice(0, 20).join("");
  return truncated || "我做了个AI工具";
}

function sanitizeThreadsTopic(topic: string) {
  const next = topic.replace(/[.。&＆]/g, "").replace(/\s+/g, " ").trim();
  const truncated = Array.from(next).slice(0, 50).join("").trim();
  return truncated;
}

function fillThreadsTopicAlternatives(topicTag: string, modelAlternatives: string[], fallbackTopics: string[]) {
  const topics = [topicTag, ...modelAlternatives, ...fallbackTopics]
    .map((topic) => sanitizeThreadsTopic(topic))
    .filter(Boolean);
  const uniqueTopics = Array.from(new Set(topics));
  return uniqueTopics.filter((topic) => topic !== topicTag).slice(0, 2);
}

function inferThreadsTopicFallbacks(content: Record<string, unknown>) {
  const text = [content.angle, content.content, content.postingTips]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (/fundrais|融资|投资|估值|股权/i.test(text)) {
    return ["Fundraising", "Startup", "Founder Life"];
  }

  if (/china|中国|gtm|go.?to.?market|市场|跨境/i.test(text)) {
    return ["GTM", "China Business", "Startup"];
  }

  if (/ai|claude|codex|automation|productivity|效率|自动化/i.test(text)) {
    return ["AI at Work", "Productivity", "Startup Life"];
  }

  if (/career|职场|工作|20s|twenties|growth/i.test(text)) {
    return ["Career Growth", "20s Career", "Work Life"];
  }

  return ["Startup", "GTM", "Career Growth"];
}
