import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPlatformKey } from "@/lib/platforms";
import type {
  PlatformKey,
  RedNoteContent,
  ScheduledPost,
  ScheduledPostStatus,
  TextPlatformContent,
} from "@/components/types";
import { fallbackScheduledPosts } from "@/components/mock-data";

type ScheduledPostRow = {
  id: string;
  generation_id: string | null;
  scheduled_for: string | null;
  status: string | null;
};

type GenerationRow = {
  id: string;
  session_id: string | null;
  platform: string;
  content: RedNoteContent | TextPlatformContent | Record<string, unknown> | null;
};

type CreateScheduledPostRequest = {
  generationId?: unknown;
  platform?: unknown;
  scheduledAt?: unknown;
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, generation_id, scheduled_for, status")
      .order("scheduled_for", { ascending: true })
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      throw new Error(error.message);
    }

    const generations = await loadGenerations(data ?? []);

    return Response.json({
      scheduledPosts: (data ?? [])
        .map((row) => rowToScheduledPost(row, generations.get(row.generation_id ?? "")))
        .filter(Boolean),
    });
  } catch {
    return Response.json({
      scheduledPosts: fallbackScheduledPosts,
    });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateScheduledPostRequest;
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : "";

  if (!generationId) {
    return Response.json({ error: "Generation ID is required." }, { status: 400 });
  }

  if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
    return Response.json({ error: "A valid scheduled date is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("scheduled_posts")
    .insert({
      generation_id: generationId,
      scheduled_for: new Date(scheduledAt).toISOString(),
      status: "scheduled",
    })
    .select("id, generation_id, scheduled_for, status")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const generations = await loadGenerations([data]);
  const scheduledPost = rowToScheduledPost(data, generations.get(data.generation_id ?? ""));

  if (!scheduledPost) {
    return Response.json({ error: "Scheduled post has an unknown generation." }, { status: 500 });
  }

  return Response.json({ scheduledPost });
}

async function loadGenerations(rows: ScheduledPostRow[]) {
  const generationIds = rows.map((row) => row.generation_id).filter((id): id is string => Boolean(id));
  if (!generationIds.length) return new Map<string, GenerationRow>();

  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("id, session_id, platform, content")
    .in("id", generationIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce<Map<string, GenerationRow>>((acc, row) => {
    acc.set(row.id, row);
    return acc;
  }, new Map());
}

function rowToScheduledPost(row: ScheduledPostRow, generation: GenerationRow | undefined): ScheduledPost | null {
  if (!row.scheduled_for || !generation || !isPlatformKey(generation.platform) || !generation.content) {
    return null;
  }

  const platform = generation.platform as PlatformKey;
  const content = generation.content as RedNoteContent | TextPlatformContent;

  return {
    id: row.id,
    generationId: row.generation_id,
    sessionId: generation.session_id,
    platform,
    title: getPlatformTitle(platform, content),
    scheduledAt: row.scheduled_for,
    status: normalizeStatus(row.status),
    content: getPlatformCopy(platform, content),
  };
}

function getPlatformTitle(platform: PlatformKey, content: RedNoteContent | TextPlatformContent) {
  if (platform === "rednote" && "title" in content) return content.title || "Untitled RedNote post";
  return content.angle || `${platform} post`;
}

function getPlatformCopy(platform: PlatformKey, content: RedNoteContent | TextPlatformContent) {
  if (platform === "rednote" && "caption" in content) {
    return `${content.title}\n\n${content.caption}\n\n${content.hashtags.join(" ")}`;
  }

  if ("content" in content) {
    return `${content.content}${content.hashtags?.length ? `\n\n${content.hashtags.join(" ")}` : ""}`;
  }

  return "";
}

function normalizeStatus(value: string | null): ScheduledPostStatus {
  if (value === "posted" || value === "draft" || value === "approved") return value;
  return "scheduled";
}
