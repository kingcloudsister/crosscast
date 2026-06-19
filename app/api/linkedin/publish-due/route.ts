import { supabaseAdmin } from "@/lib/supabase-admin";
import { publishTextToLinkedIn } from "@/lib/linkedin";
import type { RedNoteContent, TextPlatformContent } from "@/components/types";

type ScheduledPostRow = {
  id: string;
  generation_id: string | null;
  scheduled_for: string | null;
  status: string | null;
};

type GenerationRow = {
  id: string;
  platform: string;
  content: RedNoteContent | TextPlatformContent | Record<string, unknown> | null;
};

export async function POST() {
  try {
    const { data: scheduledRows, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, generation_id, scheduled_for, status")
      .lte("scheduled_for", new Date().toISOString())
      .eq("status", "scheduled")
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      throw new Error(error.message);
    }

    const generations = await loadGenerations(scheduledRows ?? []);
    const results = [];

    for (const scheduledPost of scheduledRows ?? []) {
      const generation = generations.get(scheduledPost.generation_id ?? "");

      if (!generation || generation.platform !== "linkedin") {
        continue;
      }

      if (isAlreadyPublished(generation.content)) {
        const warnings = await collectWarnings([markScheduledPostPosted(scheduledPost.id)]);
        results.push({
          scheduledPostId: scheduledPost.id,
          generationId: generation.id,
          postUrl: getPublishedUrl(generation.content),
          status: "posted",
          warnings,
        });
        continue;
      }

      const postText = getLinkedInPostText(generation.content);
      if (!postText) {
        results.push({ scheduledPostId: scheduledPost.id, error: "LinkedIn post text is empty." });
        continue;
      }

      try {
        const publishResult = await publishTextToLinkedIn(postText);
        const warnings = await collectWarnings([
          markGenerationPublished(generation.id, publishResult),
          markScheduledPostPosted(scheduledPost.id),
        ]);
        results.push({
          scheduledPostId: scheduledPost.id,
          generationId: generation.id,
          postId: publishResult.id,
          postUrl: publishResult.url,
          status: "posted",
          warnings,
        });
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : "Could not publish due LinkedIn post.";
        results.push({ scheduledPostId: scheduledPost.id, generationId: generation.id, error: message });
      }
    }

    return Response.json({ results });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not publish due LinkedIn posts.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function loadGenerations(rows: ScheduledPostRow[]) {
  const generationIds = rows.map((row) => row.generation_id).filter((id): id is string => Boolean(id));
  if (!generationIds.length) return new Map<string, GenerationRow>();

  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("id, platform, content")
    .in("id", generationIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce<Map<string, GenerationRow>>((acc, row) => {
    acc.set(row.id, row);
    return acc;
  }, new Map());
}

function getLinkedInPostText(content: GenerationRow["content"]) {
  if (!content || typeof content !== "object" || !("content" in content) || typeof content.content !== "string") {
    return "";
  }

  return content.content.trim();
}

function isAlreadyPublished(content: GenerationRow["content"]) {
  return Boolean(content && typeof content === "object" && "linkedInPublishedAt" in content && content.linkedInPublishedAt);
}

function getPublishedUrl(content: GenerationRow["content"]) {
  if (content && typeof content === "object" && "linkedInPostUrl" in content && typeof content.linkedInPostUrl === "string") {
    return content.linkedInPostUrl;
  }

  return null;
}

async function markGenerationPublished(generationId: string, result: { id: string; url: string }) {
  const { data: generation, error: loadError } = await supabaseAdmin
    .from("generations")
    .select("content")
    .eq("id", generationId)
    .single();

  if (loadError) {
    throw new Error(`Generation content could not be loaded: ${loadError.message}`);
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
    throw new Error(`Generation metadata could not be updated: ${error.message}`);
  }
}

async function markScheduledPostPosted(scheduledPostId: string) {
  const { error } = await supabaseAdmin.from("scheduled_posts").update({ status: "posted" }).eq("id", scheduledPostId);

  if (error) {
    throw new Error(`Scheduled post status could not be updated: ${error.message}`);
  }
}

async function collectWarnings(tasks: Array<Promise<void>>) {
  const results = await Promise.allSettled(tasks);
  const warnings = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));

  warnings.forEach((warning) => console.error("[LinkedIn] Due publish metadata warning", warning));
  return warnings;
}
