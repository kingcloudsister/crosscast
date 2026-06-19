const linkedInActivityPath = "https://www.linkedin.com/feed/update";

export function buildLinkedInPostUrl(postId: string) {
  const activityUrn = toLinkedInActivityUrn(postId);
  return activityUrn ? `${linkedInActivityPath}/${activityUrn}/` : "https://www.linkedin.com/feed/";
}

export function normalizeLinkedInPostUrl(url: string | null | undefined, postId?: string | null) {
  const activityUrn = toLinkedInActivityUrn(postId ?? "") ?? toLinkedInActivityUrn(url ?? "");
  return activityUrn ? `${linkedInActivityPath}/${activityUrn}/` : (url ?? null);
}

function toLinkedInActivityUrn(value: string) {
  const normalized = decodeLinkedInValue(value.trim());
  if (!normalized) return null;

  const activityUrn = normalized.match(/urn:li:activity:\d+/)?.[0];
  if (activityUrn) return activityUrn;

  const shareUrn = normalized.match(/urn:li:(?:share|ugcPost):(\d+)/);
  if (shareUrn) return `urn:li:activity:${shareUrn[1]}`;

  const numericId = normalized.match(/^\d+$/);
  if (numericId) return `urn:li:activity:${numericId[0]}`;

  return null;
}

function decodeLinkedInValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
