import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  BriefState,
  GeneratedContent,
  PlatformKey,
  PlatformStatus,
  RedNoteContent,
  SessionDetail,
  TextPlatformContent,
  ThreadsContent,
} from "@/components/types";
import { isPlatformKey } from "@/lib/platforms";
import { normalizeLinkedInPostUrl } from "@/lib/linkedin-url";
import { fallbackSessions, sampleGeneration } from "@/components/mock-data";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SessionRow = {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  theme: string | null;
  raw_material: string | null;
  additional_context: string | null;
  images: BriefState["images"] | null;
  selected_platforms: PlatformKey[] | null;
};

type GenerationRow = {
  id: string;
  platform: string;
  status: string | null;
  content: RedNoteContent | TextPlatformContent | ThreadsContent | Record<string, unknown> | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const fallback = getFallbackSessionDetail(id);

  if (fallback) {
    return Response.json({ session: fallback });
  }

  try {
    const [sessionResult, generationsResult] = await Promise.all([
      supabaseAdmin
        .from("sessions")
        .select("id, created_at, updated_at, theme, raw_material, additional_context, images, selected_platforms")
        .eq("id", id)
        .single(),
      supabaseAdmin
        .from("generations")
        .select("id, platform, status, content")
        .eq("session_id", id)
        .order("created_at", { ascending: true }),
    ]);

    if (sessionResult.error) {
      return Response.json({ error: sessionResult.error.message }, { status: 404 });
    }

    if (generationsResult.error) {
      throw new Error(generationsResult.error.message);
    }

    return Response.json({
      session: rowToSessionDetail(sessionResult.data, generationsResult.data ?? []),
    });
  } catch {
    return Response.json({ error: "Could not load session." }, { status: 500 });
  }
}

function rowToSessionDetail(row: SessionRow, generations: GenerationRow[]): SessionDetail {
  return {
    id: row.id,
    date: formatDate(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    title: row.theme || "Untitled brief",
    brief: {
      theme: row.theme ?? "",
      rawMaterial: row.raw_material ?? "",
      additionalContext: row.additional_context ?? "",
      images: Array.isArray(row.images) ? row.images : [],
      selectedPlatforms: Array.isArray(row.selected_platforms) && row.selected_platforms.length
        ? row.selected_platforms
        : ["rednote", "threads", "linkedin"],
    },
    generation: buildGeneration(generations, row),
  };
}

function buildGeneration(generations: GenerationRow[], session: SessionRow): GeneratedContent | null {
  if (!generations.length) return null;

  const generation: GeneratedContent = {
    contentAnalysis: {
      contentType: "Saved Content",
      summary: session.raw_material || session.theme || "Saved generated content",
    },
    platforms: {},
    generationIds: {},
    platformStatuses: {},
  };

  generations.forEach((row) => {
    if (!isPlatformKey(row.platform) || !row.content) return;

    if (row.platform === "rednote") {
      generation.platforms.rednote = row.content as RedNoteContent;
    } else if (row.platform === "threads") {
      generation.platforms.threads = row.content as ThreadsContent;
    } else if (row.platform === "linkedin") {
      generation.platforms.linkedin = normalizeLinkedInContent(row.content as TextPlatformContent);
    }

    generation.generationIds![row.platform] = row.id;
    generation.platformStatuses![row.platform] = normalizePlatformStatus(row.status, row.content);
  });

  return Object.keys(generation.platforms).length ? generation : null;
}

function normalizeLinkedInContent(content: TextPlatformContent): TextPlatformContent {
  const postUrl = typeof content.linkedInPostUrl === "string" ? content.linkedInPostUrl : null;
  const postId = typeof content.linkedInPostId === "string" ? content.linkedInPostId : null;
  const normalizedPostUrl = normalizeLinkedInPostUrl(postUrl, postId);

  return normalizedPostUrl
    ? {
        ...content,
        linkedInPostUrl: normalizedPostUrl,
      }
    : content;
}

function normalizePlatformStatus(status: string | null, content: GenerationRow["content"]): PlatformStatus {
  if (status === "posted") return "posted";
  if (content && typeof content === "object" && "linkedInPublishedAt" in content && content.linkedInPublishedAt) return "posted";
  if (status === "approved") return "approved";
  if (content && typeof content === "object" && "recommended" in content && content.recommended === true) return "recommended";
  return "skip";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getFallbackSessionDetail(id: string): SessionDetail | null {
  const session = fallbackSessions.find((item) => item.id === id);

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    date: session.date,
    title: session.title,
    brief: session.brief,
    generation: session.id === "may-27-claude" ? sampleGeneration : null,
  };
}
