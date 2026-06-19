import { supabaseAdmin } from "@/lib/supabase-admin";
import { createOpenRouterChatCompletion, extractTextContent, parseJsonFromOpenRouterContent } from "@/lib/openrouter";

type ApplyRequest = {
  sessionId?: unknown;
};

type MessageRow = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApplyRequest;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

    if (!sessionId) {
      return Response.json({ error: "Session ID is required." }, { status: 400 });
    }

    const history = await loadMessageHistory(sessionId);

    if (!history.length) {
      return Response.json({ error: "No assistant conversation found for this session." }, { status: 400 });
    }

    const response = await createOpenRouterChatCompletion({
      maxTokens: 1200,
      temperature: 0.2,
      responseFormat: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content:
            "Extract a structured Crosscast content brief from Kelly's assistant conversation. Preserve specific examples, outcomes, audience notes, and platform context. Return concise usable field values as JSON only, with keys theme, rawMaterial, and additionalContext. Do not include markdown or commentary.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              conversation: history,
              outputFields: ["theme", "rawMaterial", "additionalContext"],
            },
            null,
            2,
          ),
        },
      ],
    });

    const text = extractTextContent(response);
    console.log("[OpenRouter] Raw apply-to-brief chat completion response:", JSON.stringify(response, null, 2));
    console.log("[OpenRouter] Raw apply-to-brief message.content:", text);

    if (!text) {
      throw new Error("OpenRouter returned an empty brief extraction response.");
    }

    const fields = validateBriefFields(parseJsonFromOpenRouterContent(text));
    return Response.json(fields);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not apply assistant conversation to brief.";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function loadMessageHistory(sessionId: string): Promise<MessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(40);

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

function validateBriefFields(value: unknown) {
  const fields = value as {
    theme?: unknown;
    rawMaterial?: unknown;
    additionalContext?: unknown;
  };

  return {
    theme: typeof fields.theme === "string" ? fields.theme : "",
    rawMaterial: typeof fields.rawMaterial === "string" ? fields.rawMaterial : "",
    additionalContext: typeof fields.additionalContext === "string" ? fields.additionalContext : "",
  };
}
