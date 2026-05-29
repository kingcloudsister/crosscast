import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPlatformKey } from "@/lib/platforms";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateGenerationRequest = {
  content?: unknown;
  status?: unknown;
};

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as UpdateGenerationRequest;

  if (!body.content || typeof body.content !== "object") {
    return Response.json({ error: "Generation content is required." }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "draft";
  const content = body.content as Record<string, unknown>;
  const updatePayload = {
    content,
    status,
    recommended: Boolean(content.recommended),
    skip_reason: typeof content.skipReason === "string" ? content.skipReason : null,
    angle: typeof content.angle === "string" ? content.angle : null,
  };

  const { data, error } = await supabaseAdmin
    .from("generations")
    .update(updatePayload)
    .eq("id", id)
    .select("id, platform, status, content")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!isPlatformKey(data.platform)) {
    return Response.json({ error: "Generation has an unknown platform." }, { status: 500 });
  }

  return Response.json({
    generationId: data.id,
    platform: data.platform,
    status: data.status,
    content: data.content,
  });
}
