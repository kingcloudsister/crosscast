import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BriefState, PlatformKey, SessionSummary } from "@/components/types";
import { defaultBrief, fallbackSessions } from "@/components/mock-data";

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

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .select("id, created_at, updated_at, theme, raw_material, additional_context, images, selected_platforms")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(30)
      .abortSignal(AbortSignal.timeout(10000));

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      sessions: (data ?? []).map(rowToSession),
    });
  } catch {
    return Response.json({
      sessions: fallbackSessions,
      error: "Saved history is unavailable because Supabase could not be reached. Showing local demo sessions.",
    });
  }
}

export async function POST() {
  const id = crypto.randomUUID();
  try {
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        id,
        theme: "",
        raw_material: "",
        additional_context: "",
        images: [],
        selected_platforms: [],
      })
      .select("id, created_at, updated_at, theme, raw_material, additional_context, images, selected_platforms")
      .abortSignal(AbortSignal.timeout(10000))
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      session: rowToSession(data),
    });
  } catch {
    return Response.json({
      session: {
        id,
        date: formatDate(new Date().toISOString()),
        title: "Untitled brief",
        brief: defaultBrief,
      },
    });
  }
}

function rowToSession(row: SessionRow): SessionSummary {
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
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
