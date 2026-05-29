import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BriefState, GeneratedContent, PlatformKey } from "@/components/types";
import {
  GENERATION_SYSTEM_PROMPT,
  generationToolName,
  generationToolSchema,
  normalizeGenerationPlatforms,
  validateGeneration,
} from "@/lib/generation-utils";
import { isPlatformKey } from "@/lib/platforms";

type RegenerateRequest = {
  generationId?: unknown;
  feedback?: unknown;
};

type GenerationRow = {
  id: string;
  session_id: string;
  platform: string;
  content: Record<string, unknown> | null;
};

type SessionRow = {
  theme: string | null;
  raw_material: string | null;
  additional_context: string | null;
  images: BriefState["images"] | null;
  selected_platforms: PlatformKey[] | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegenerateRequest;
    const generationId = typeof body.generationId === "string" ? body.generationId : "";
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";

    if (!generationId) {
      return Response.json({ error: "Generation ID is required." }, { status: 400 });
    }

    if (!feedback) {
      return Response.json({ error: "Feedback is required." }, { status: 400 });
    }

    const generationRow = await loadGeneration(generationId);
    if (!isPlatformKey(generationRow.platform)) {
      return Response.json({ error: "Unknown generation platform." }, { status: 400 });
    }

    const sessionRow = await loadSession(generationRow.session_id);
    const platform = generationRow.platform;
    const regenerated = await callClaudeForPlatform({
      session: sessionRow,
      platform,
      previousContent: generationRow.content,
      feedback,
    });
    const content = regenerated.platforms[platform];

    if (!content) {
      throw new Error("Claude did not return regenerated content for the requested platform.");
    }

    const { error } = await supabaseAdmin
      .from("generations")
      .update({
        content,
        status: "draft",
        recommended: content.recommended,
        skip_reason: content.skipReason,
        angle: content.angle,
      })
      .eq("id", generationId);

    if (error) {
      throw new Error(`Could not save regenerated content: ${error.message}`);
    }

    return Response.json({
      generationId,
      platform,
      content,
      contentAnalysis: regenerated.contentAnalysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Regeneration failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function loadGeneration(generationId: string): Promise<GenerationRow> {
  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("id, session_id, platform, content")
    .eq("id", generationId)
    .single();

  if (error) {
    throw new Error(`Could not load generation: ${error.message}`);
  }

  return data;
}

async function loadSession(sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("theme, raw_material, additional_context, images, selected_platforms")
    .eq("id", sessionId)
    .single();

  if (error) {
    throw new Error(`Could not load session brief: ${error.message}`);
  }

  return data;
}

async function callClaudeForPlatform({
  session,
  platform,
  previousContent,
  feedback,
}: {
  session: SessionRow;
  platform: PlatformKey;
  previousContent: Record<string, unknown> | null;
  feedback: string;
}): Promise<GeneratedContent> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    temperature: 0.7,
    system: GENERATION_SYSTEM_PROMPT,
    tools: [
      {
        name: generationToolName,
        description: "Emit the regenerated Crosscast platform response as structured JSON.",
        input_schema: generationToolSchema as Tool.InputSchema,
      },
    ],
    tool_choice: {
      type: "tool",
      name: generationToolName,
    },
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            instruction: "Regenerate only the requested platform. Keep the same JSON structure but include only that platform.",
            selectedPlatforms: [platform],
            feedback,
            originalBrief: {
              theme: session.theme ?? "",
              rawMaterial: session.raw_material ?? "",
              additionalContext: session.additional_context ?? "",
              images: session.images ?? [],
            },
            previousContent,
          },
          null,
          2,
        ),
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === generationToolName);
  if (toolUse?.type !== "tool_use") {
    throw new Error("Claude did not return structured regenerated content.");
  }

  return normalizeGenerationPlatforms(validateGeneration(toolUse.input), [platform]);
}
