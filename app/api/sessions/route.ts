import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BriefState, PlatformKey, SessionSummary } from "@/components/types";

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
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id, created_at, updated_at, theme, raw_material, additional_context, images, selected_platforms")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(30);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    sessions: (data ?? []).map(rowToSession),
  });
}

export async function POST() {
  const id = crypto.randomUUID();
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
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    session: rowToSession(data),
  });
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
