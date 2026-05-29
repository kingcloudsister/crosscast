import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  BriefState,
  GeneratedContent,
  PlatformKey,
  RedNoteContent,
  SessionDetail,
  TextPlatformContent,
} from "@/components/types";
import { isPlatformKey } from "@/lib/platforms";

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
  content: RedNoteContent | TextPlatformContent | Record<string, unknown> | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
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
    return Response.json({ error: generationsResult.error.message }, { status: 500 });
  }

  return Response.json({
    session: rowToSessionDetail(sessionResult.data, generationsResult.data ?? []),
  });
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
  };

  generations.forEach((row) => {
    if (!isPlatformKey(row.platform) || !row.content) return;

    if (row.platform === "rednote") {
      generation.platforms.rednote = row.content as RedNoteContent;
    } else if (row.platform === "threads") {
      generation.platforms.threads = row.content as TextPlatformContent;
    } else if (row.platform === "linkedin") {
      generation.platforms.linkedin = row.content as TextPlatformContent;
    }

    generation.generationIds![row.platform] = row.id;
  });

  return Object.keys(generation.platforms).length ? generation : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
