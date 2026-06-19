import { buildLinkedInPostUrl } from "@/lib/linkedin-url";

type LinkedInUserInfo = {
  sub?: string;
};

type LinkedInPublishResult = {
  id: string;
  url: string;
};

export async function publishTextToLinkedIn(text: string): Promise<LinkedInPublishResult> {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("LINKEDIN_ACCESS_TOKEN is not configured.");
  }

  const author = await fetchLinkedInAuthorUrn(accessToken);
  const publishResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });

  const responseText = await publishResponse.text();
  const responseJson = parseJsonSafely(responseText);

  if (!publishResponse.ok) {
    const duplicateUrn = extractDuplicateUrn(responseJson ?? responseText);
    if (duplicateUrn) {
      console.warn("[LinkedIn] Content already exists as", duplicateUrn);
      return {
        id: duplicateUrn,
        url: buildLinkedInPostUrl(duplicateUrn),
      };
    }

    console.error("[LinkedIn] ugcPosts publish failed", {
      status: publishResponse.status,
      statusText: publishResponse.statusText,
      headers: Object.fromEntries(publishResponse.headers.entries()),
      body: responseJson ?? responseText,
    });
    throw new Error(linkedInErrorMessage(publishResponse.status, responseJson ?? responseText));
  }

  const id =
    responseJson && typeof responseJson === "object" && "id" in responseJson && typeof responseJson.id === "string"
      ? responseJson.id
      : publishResponse.headers.get("x-restli-id") ?? "";

  return {
    id,
    url: id ? buildLinkedInPostUrl(id) : "https://www.linkedin.com/feed/",
  };
}

async function fetchLinkedInAuthorUrn(accessToken: string) {
  const userInfoResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const responseText = await userInfoResponse.text();
  const userInfo = parseJsonSafely(responseText) as LinkedInUserInfo | null;

  if (!userInfoResponse.ok || !userInfo?.sub) {
    console.error("[LinkedIn] userinfo failed", {
      status: userInfoResponse.status,
      statusText: userInfoResponse.statusText,
      headers: Object.fromEntries(userInfoResponse.headers.entries()),
      body: userInfo ?? responseText,
    });
    throw new Error(linkedInErrorMessage(userInfoResponse.status, userInfo ?? responseText));
  }

  return `urn:li:person:${userInfo.sub}`;
}

function parseJsonSafely(value: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractDuplicateUrn(body: unknown): string | null {
  const text =
    body && typeof body === "object" && "message" in body && typeof (body as Record<string, unknown>).message === "string"
      ? (body as Record<string, string>).message
      : typeof body === "string"
        ? body
        : null;
  if (!text) return null;
  const match = text.match(/duplicate of (urn:li:(?:share|ugcPost|activity):\d+)/);
  return match ? match[1] : null;
}

function linkedInErrorMessage(status: number, body: unknown) {
  if (status === 401) {
    return "LinkedIn returned 401. The access token may be expired or missing required scopes.";
  }

  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }

  return `LinkedIn API request failed with status ${status}. Check server logs for the full response.`;
}
