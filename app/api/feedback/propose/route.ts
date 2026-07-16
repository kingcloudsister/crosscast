import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizePlatformContent } from "@/lib/content-sanitizer";
import {
  createOpenRouterChatCompletion,
  extractTextContent,
  parseJsonFromOpenRouterContent,
} from "@/lib/openrouter";
import { isPlatformKey } from "@/lib/platforms";
import type { PlatformContent, PlatformKey } from "@/components/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type ProposalRequest = {
  generationId?: unknown;
  feedback?: unknown;
  currentText?: unknown;
  selection?: unknown;
};

type SelectionTarget = {
  start: number;
  end: number;
  text: string;
};

type GenerationRow = {
  id: string;
  session_id: string;
  platform: string;
  content: PlatformContent | null;
};

type SessionRow = {
  theme: string | null;
  raw_material: string | null;
  additional_context: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProposalRequest;
    const generationId = typeof body.generationId === "string" ? body.generationId : "";
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    const currentText = typeof body.currentText === "string" ? body.currentText : "";

    if (!generationId) {
      return Response.json({ error: "Generation ID is required." }, { status: 400 });
    }
    if (!feedback) {
      return Response.json({ error: "Tell Crosscast what should change." }, { status: 400 });
    }
    if (!currentText.trim()) {
      return Response.json({ error: "The current caption is empty." }, { status: 400 });
    }
    let selection: SelectionTarget | null;
    try {
      selection = parseSelection(body.selection, currentText);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "The selected text is invalid.";
      return Response.json({ error: message }, { status: 409 });
    }

    const generation = await loadGeneration(generationId);
    if (!isPlatformKey(generation.platform)) {
      return Response.json({ error: "Unknown generation platform." }, { status: 400 });
    }

    const session = await loadSession(generation.session_id);
    const platform = generation.platform;
    const proposal = await proposeTextRevision({ platform, currentText, feedback, session, selection });
    const sanitizedRevision = sanitizeProposedText(platform, generation.content, proposal.proposedText);
    const proposedText = selection
      ? `${currentText.slice(0, selection.start)}${sanitizedRevision}${currentText.slice(selection.end)}`
      : sanitizedRevision;

    if (!proposedText.trim() || proposedText === currentText) {
      return Response.json(
        { error: "The proposal did not produce a meaningful change. Try describing the desired tone or specific passage." },
        { status: 422 },
      );
    }

    return Response.json({
      generationId,
      platform,
      originalText: currentText,
      proposedText,
      summary: proposal.summary,
      target: selection ? "selection" : "overall",
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not propose caption changes.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function loadGeneration(generationId: string): Promise<GenerationRow> {
  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("id, session_id, platform, content")
    .eq("id", generationId)
    .single();

  if (error) throw new Error(`Could not load generation: ${error.message}`);
  return data as GenerationRow;
}

async function loadSession(sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("theme, raw_material, additional_context")
    .eq("id", sessionId)
    .single();

  if (error) throw new Error(`Could not load the source brief: ${error.message}`);
  return data;
}

async function proposeTextRevision({
  platform,
  currentText,
  feedback,
  session,
  selection,
}: {
  platform: PlatformKey;
  currentText: string;
  feedback: string;
  session: SessionRow;
  selection: SelectionTarget | null;
}) {
  const editingInstruction = selection
    ? `Revise only the selected passage. Return proposedText containing only the replacement passage, not the full post. Preserve its paragraph boundaries unless the feedback asks otherwise.`
    : `Revise the complete post body. Return proposedText containing the full revised post.`;
  const response = await createOpenRouterChatCompletion({
    messages: [
      {
        role: "system",
        content: `You are Crosscast's precise post editor for ${platform}. ${editingInstruction} Follow the user's feedback while preserving factual claims, personal voice, paragraph breaks, language, and platform-native formatting unless the feedback explicitly asks to change them. Do not add invented experiences, metrics, or claims. Return JSON only with {"proposedText":"...","summary":"one short sentence describing the material changes"}.`,
      },
      {
        role: "user",
        content: [
          `Brief title: ${session.theme ?? "Untitled"}`,
          `Raw material:\n${session.raw_material ?? ""}`,
          `Additional context:\n${session.additional_context ?? ""}`,
          `Current ${platform} post:\n${currentText}`,
          ...(selection ? [`Selected passage to revise:\n${selection.text}`] : []),
          `Requested change:\n${feedback}`,
        ].join("\n\n"),
      },
    ],
    maxTokens: 5000,
    temperature: 0.35,
    responseFormat: { type: "json_object" },
  });

  const parsed = parseJsonFromOpenRouterContent(extractTextContent(response)) as {
    proposedText?: unknown;
    summary?: unknown;
  };
  if (typeof parsed.proposedText !== "string") {
    throw new Error("Crosscast did not return a revised caption.");
  }

  return {
    proposedText: selection ? parsed.proposedText : parsed.proposedText.trim(),
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "Caption revised from your feedback.",
  };
}

function parseSelection(value: unknown, currentText: string): SelectionTarget | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The selected text is invalid. Select the passage again.");
  }

  const record = value as Record<string, unknown>;
  const start = record.start;
  const end = record.end;
  const text = record.text;
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > currentText.length ||
    typeof text !== "string" ||
    currentText.slice(start, end) !== text
  ) {
    throw new Error("The selected text has changed. Select the passage again, then add your comment.");
  }

  return { start, end, text };
}

function sanitizeProposedText(platform: PlatformKey, content: PlatformContent | null, proposedText: string) {
  if (!content) return proposedText;
  const next =
    platform === "rednote" && "caption" in content
      ? { ...content, caption: proposedText }
      : "content" in content
        ? { ...content, content: proposedText }
        : content;
  const sanitized = sanitizePlatformContent(platform, next);
  return platform === "rednote" && "caption" in sanitized
    ? sanitized.caption
    : "content" in sanitized
      ? sanitized.content
      : proposedText;
}
