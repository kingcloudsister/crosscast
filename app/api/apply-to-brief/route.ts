import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { supabaseAdmin } from "@/lib/supabase-admin";

const applyToolName = "emit_brief_fields";
const applyToolSchema: Tool.InputSchema = {
  type: "object",
  required: ["theme", "rawMaterial", "additionalContext"],
  properties: {
    theme: { type: "string" },
    rawMaterial: { type: "string" },
    additionalContext: { type: "string" },
  },
};

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

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      temperature: 0.2,
      system:
        "Extract a structured Crosscast content brief from Kelly's assistant conversation. Preserve specific examples, outcomes, audience notes, and platform context. Return concise usable field values, not commentary.",
      tools: [
        {
          name: applyToolName,
          description: "Return suggested Content Brief fields extracted from the assistant conversation.",
          input_schema: applyToolSchema,
        },
      ],
      tool_choice: {
        type: "tool",
        name: applyToolName,
      },
      messages: [
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

    const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === applyToolName);

    if (toolUse?.type !== "tool_use") {
      throw new Error("Claude did not return structured brief fields.");
    }

    const fields = validateBriefFields(toolUse.input);
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
