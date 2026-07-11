import { supabaseAdmin } from "@/lib/supabase-admin";
import { publishTextToLinkedIn } from "@/lib/linkedin";

type PublishRequest = {
  postText?: unknown;
  generationId?: unknown;
  scheduledPostId?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as PublishRequest;
  const postText = typeof body.postText === "string" ? body.postText.trim() : "";
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  const scheduledPostId = typeof body.scheduledPostId === "string" ? body.scheduledPostId : "";

  if (!postText) {
    return Response.json({ error: "LinkedIn post text is required." }, { status: 400 });
  }

  try {
    const imageUrl = generationId ? await loadGenerationImageUrl(generationId) : null;
    const result = await publishTextToLinkedIn(postText, { imageUrl });
    const tasks: Array<Promise<void>> = [];
    if (generationId) tasks.push(markGenerationPublished(generationId, result));
    if (scheduledPostId) {
      tasks.push(markScheduledPostPosted(scheduledPostId));
    } else if (generationId) {
      tasks.push(createPostedScheduledPost(generationId, result));
    }
    const warnings = await collectWarnings(tasks);

    return Response.json({
      postId: result.id,
      postUrl: result.url,
      status: "posted",
      warnings,
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not publish to LinkedIn.";
    return Response.json({ error: message }, { status: message.includes("401") ? 401 : 500 });
  }
}

async function loadGenerationImageUrl(generationId: string) {
  const { data, error } = await supabaseAdmin.from("generations").select("content").eq("id", generationId).single();

  if (error) {
    console.error("[LinkedIn] Could not load generation image before publishing", error.message);
    return null;
  }

  return extractImageUrl(data?.content);
}

function extractImageUrl(content: unknown) {
  if (!content || typeof content !== "object" || !("image" in content)) return null;
  const image = (content as { image?: unknown }).image;
  if (!image || typeof image !== "object" || !("url" in image)) return null;
  const url = (image as { url?: unknown }).url;
  return typeof url === "string" && url ? url : null;
}

async function markGenerationPublished(generationId: string, result: { id: string; url: string }) {
  const { data: generation, error: loadError } = await supabaseAdmin
    .from("generations")
    .select("content")
    .eq("id", generationId)
    .single();

  if (loadError) {
    throw new Error(`LinkedIn post was published, but generation content could not be loaded: ${loadError.message}`);
  }

  const existingContent =
    generation.content && typeof generation.content === "object" && !Array.isArray(generation.content)
      ? (generation.content as Record<string, unknown>)
      : {};
  const nextContent = {
    ...existingContent,
    linkedInPostId: result.id,
    linkedInPostUrl: result.url,
    linkedInPublishedAt: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("generations")
    .update({
      content: nextContent,
      status: "approved",
    })
    .eq("id", generationId);

  if (error) {
    throw new Error(`LinkedIn post was published, but generation metadata could not be updated: ${error.message}`);
  }
}

async function markScheduledPostPosted(scheduledPostId: string) {
  const { error } = await supabaseAdmin.from("scheduled_posts").update({ status: "posted" }).eq("id", scheduledPostId);

  if (error) {
    throw new Error(`LinkedIn post was published, but scheduled post status could not be updated: ${error.message}`);
  }
}

async function createPostedScheduledPost(generationId: string, result: { id: string; url: string }) {
  const { error } = await supabaseAdmin.from("scheduled_posts").insert({
    generation_id: generationId,
    scheduled_for: new Date().toISOString(),
    status: "posted",
  });

  if (error) {
    throw new Error(`LinkedIn post was published, but a scheduled post record could not be created: ${error.message}`);
  }
}

async function collectWarnings(tasks: Array<Promise<void>>) {
  const results = await Promise.allSettled(tasks);
  const warnings = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));

  warnings.forEach((warning) => console.error("[LinkedIn] Post-publish metadata warning", warning));
  return warnings;
}
