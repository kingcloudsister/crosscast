import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BriefState } from "@/components/types";

const ASSISTANT_SYSTEM_PROMPT = `You are Kelly's content ideation assistant for Crosscast. You help her develop content ideas for her three platforms: RedNote (小红书), Threads, and LinkedIn.

You know her positioning:
- RedNote: 文科生闯进科技圈 — AI tool tutorials, workflow automation, practical prompts
- Threads: Cross-border GTM, startup insights, career exploration, strategic thinking
- LinkedIn: Professional GTM frameworks, China market insight, startup ops lessons

You can see her current Content Brief fields (theme, raw material, context) if she's started filling them in. Use those as context.

When she shares a rough idea, help develop it by asking smart clarifying questions:
- What specifically happened / what did she discover?
- What was the outcome or result?
- Who would find this most useful?
- What's the one thing she wants readers to walk away with?

Don't over-interview — 1-2 questions at a time. Be conversational. If she gives enough material, tell her the idea is ready and suggest she click Generate. Respond in the language she writes in.`;

type ChatRequest = {
  sessionId?: string | null;
  message?: unknown;
  briefContext?: Partial<BriefState>;
};

type MessageRow = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    const sessionId = await ensureSession(body.sessionId ?? null, body.briefContext ?? {});
    const history = await loadMessageHistory(sessionId);
    await saveMessage(sessionId, "user", message);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      temperature: 0.7,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [
        ...history.map((item) => ({
          role: item.role,
          content: item.content,
        })),
        {
          role: "user" as const,
          content: buildBriefContextMessage(body.briefContext ?? {}, message),
        },
      ],
    });

    const encoder = new TextEncoder();
    let assistantText = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              assistantText += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }

          if (assistantText.trim()) {
            await saveMessage(sessionId, "assistant", assistantText.trim());
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Session-Id": sessionId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function ensureSession(sessionId: string | null, brief: Partial<BriefState>) {
  const id = sessionId ?? crypto.randomUUID();
  const { error } = await supabaseAdmin.from("sessions").upsert(
    {
      id,
      theme: brief.theme ?? "",
      raw_material: brief.rawMaterial ?? "",
      additional_context: brief.additionalContext ?? "",
      images: brief.images ?? [],
      selected_platforms: brief.selectedPlatforms ?? [],
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Could not save assistant session: ${error.message}`);
  }

  return id;
}

async function loadMessageHistory(sessionId: string): Promise<MessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Could not load assistant conversation: ${error.message}`);
  }

  return (data ?? [])
    .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .map((item) => ({
      role: item.role,
      content: item.content,
    }));
}

async function saveMessage(sessionId: string, role: "user" | "assistant", content: string) {
  const { error } = await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    role,
    content,
  });

  if (error) {
    throw new Error(`Could not save assistant message: ${error.message}`);
  }
}

function buildBriefContextMessage(brief: Partial<BriefState>, message: string) {
  return JSON.stringify(
    {
      currentBrief: {
        theme: brief.theme ?? "",
        rawMaterial: brief.rawMaterial ?? "",
        additionalContext: brief.additionalContext ?? "",
        selectedPlatforms: brief.selectedPlatforms ?? [],
        images: (brief.images ?? []).map((image) => ({
          name: image.name,
          url: image.url,
        })),
      },
      userMessage: message,
    },
    null,
    2,
  );
}
