import type { UploadedImage } from "@/components/types";

export const OPENROUTER_MODEL = "anthropic/claude-sonnet-4-6";
export const OPENROUTER_IMAGE_MODEL = "openai/gpt-image-2";

export type JsonSchema = Record<string, unknown>;

type OpenRouterContentBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentBlock[];
};

type OpenRouterTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: JsonSchema;
  };
};

type OpenRouterChatRequest = {
  messages: OpenRouterMessage[];
  maxTokens: number;
  temperature: number;
  responseFormat?: {
    type: "json_object";
  };
  tools?: OpenRouterTool[];
  toolChoice?: {
    type: "function";
    function: {
      name: string;
    };
  };
  stream?: boolean;
};

type OpenRouterToolCall = {
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
};

export type OpenRouterChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
};

export async function createOpenRouterChatCompletion(request: OpenRouterChatRequest): Promise<OpenRouterChatCompletion> {
  const response = await fetchOpenRouter(request);
  return (await response.json()) as OpenRouterChatCompletion;
}

export async function createOpenRouterChatStream(request: OpenRouterChatRequest) {
  return fetchOpenRouter({ ...request, stream: true });
}

export function buildVisionUserContent(text: string, images: UploadedImage[] = []): OpenRouterContentBlock[] {
  return [
    {
      type: "text",
      text,
    },
    ...images.filter(hasBase64ImageUrl).map((image) => ({
      type: "image_url" as const,
      image_url: {
        url: image.url,
      },
    })),
  ];
}

export function extractToolArguments(response: OpenRouterChatCompletion, toolName: string) {
  const toolCall = response.choices?.[0]?.message?.tool_calls?.find(
    (call) => call.type === "function" && call.function.name === toolName,
  );

  if (!toolCall) {
    return null;
  }

  if (typeof toolCall.function.arguments !== "string") {
    return toolCall.function.arguments;
  }

  return JSON.parse(toolCall.function.arguments) as unknown;
}

export function extractTextContent(response: OpenRouterChatCompletion) {
  return response.choices?.[0]?.message?.content?.trim() ?? "";
}

export function parseJsonFromOpenRouterContent(content: string) {
  const candidates = [
    content.trim(),
    ...Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1].trim()),
  ];

  const objectText = extractFirstJsonObject(content);
  if (objectText) {
    candidates.push(objectText);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = JSON.parse(candidate) as unknown;
      return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    } catch {
      try {
        const parsed = JSON.parse(repairUnescapedQuotes(candidate)) as unknown;
        return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
      } catch {
        // Try the next candidate.
      }
    }
  }

  console.error("[OpenRouter] Failed to parse JSON from message.content:", content);
  throw new Error("OpenRouter returned content that could not be parsed as JSON. See server logs for the raw content.");
}

type OpenRouterImageRequest = {
  prompt: string;
  // Only sent when set — GPT Image models pick their own canvas and reject the param.
  aspectRatio?: string;
  // HTTP(S) URLs or base64 data URLs the model uses as visual references.
  inputReferences?: string[];
  // Overrides the default image model (e.g. Gemini for calls that need a fixed aspect ratio).
  model?: string;
};

type OpenRouterImageResponse = {
  data?: Array<{ b64_json?: string }>;
  usage?: {
    cost?: number;
    total_tokens?: number;
  };
};

// Image generation uses OpenRouter's dedicated images endpoint, not chat completions.
// Images come back base64-encoded in data[0].b64_json.
export async function createOpenRouterImage(request: OpenRouterImageRequest) {
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Crosscast",
    },
    body: JSON.stringify({
      model: request.model ?? OPENROUTER_IMAGE_MODEL,
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
      input_references: request.inputReferences?.length
        ? request.inputReferences.slice(0, 16).map((url) => ({
            type: "image_url",
            image_url: { url },
          }))
        : undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter image request failed (${response.status}): ${detail || response.statusText}`);
  }

  const result = (await response.json()) as OpenRouterImageResponse;
  const base64 = result.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error("OpenRouter image response did not include image data.");
  }

  console.log("[OpenRouter] Image generated", {
    model: request.model ?? OPENROUTER_IMAGE_MODEL,
    cost: result.usage?.cost ?? null,
    totalTokens: result.usage?.total_tokens ?? null,
  });

  return {
    buffer: Buffer.from(base64, "base64"),
    cost: result.usage?.cost ?? null,
  };
}

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  return apiKey;
}

async function fetchOpenRouter(request: OpenRouterChatRequest) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Crosscast",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      response_format: request.responseFormat,
      tools: request.tools,
      tool_choice: request.toolChoice,
      stream: request.stream,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${detail || response.statusText}`);
  }

  return response;
}

function repairUnescapedQuotes(jsonText: string) {
  let repaired = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index];

    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      repaired += char;
      escaped = true;
      continue;
    }

    if (char !== "\"") {
      repaired += char;
      continue;
    }

    if (!inString) {
      inString = true;
      repaired += char;
      continue;
    }

    if (isLikelyClosingQuote(jsonText, index)) {
      inString = false;
      repaired += char;
      continue;
    }

    repaired += "\\\"";
  }

  return repaired;
}

function isLikelyClosingQuote(text: string, quoteIndex: number) {
  for (let index = quoteIndex + 1; index < text.length; index += 1) {
    const next = text[index];
    if (/\s/.test(next)) continue;

    return next === "," || next === "}" || next === "]" || next === ":";
  }

  return true;
}

function hasBase64ImageUrl(image: UploadedImage) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(image.url);
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  return null;
}
