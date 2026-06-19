import type { GeneratedContent, PlatformKey } from "@/components/types";

const forbiddenTitlePhrases = ["超强", "必看", "绝绝子", "神器"];

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

  if (
    platform === "rednote" &&
    sanitized &&
    typeof sanitized === "object" &&
    "title" in sanitized &&
    typeof sanitized.title === "string"
  ) {
    return {
      ...sanitized,
      title: sanitizeRedNoteTitle(sanitized.title),
    };
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
