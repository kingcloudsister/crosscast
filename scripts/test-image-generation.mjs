// Phase 0 spike: verify OpenRouter's dedicated image endpoint end-to-end.
// Usage: node scripts/test-image-generation.mjs
// Reads OPENROUTER_API_KEY from .env.local, saves the image next to this script.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envLine = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .split("\n")
  .find((line) => line.startsWith("OPENROUTER_API_KEY="));
const apiKey = envLine?.slice("OPENROUTER_API_KEY=".length).trim();
if (!apiKey) {
  console.error("OPENROUTER_API_KEY not found in .env.local");
  process.exit(1);
}

const MODEL = "google/gemini-3.1-flash-image";

const response = await fetch("https://openrouter.ai/api/v1/images", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Crosscast",
  },
  body: JSON.stringify({
    model: MODEL,
    prompt:
      "Editorial minimalist illustration of a small wooden bridge connecting two cliffs at dawn, generous negative space, muted palette with one warm orange accent, clean composition, no text in image",
    aspect_ratio: "16:9",
    resolution: "1K",
    output_format: "png",
  }),
});

if (!response.ok) {
  console.error(`Image request failed (${response.status}):`, await response.text());
  process.exit(1);
}

const result = await response.json();
const image = result.data?.[0];
if (!image?.b64_json) {
  console.error("No b64_json in response:", JSON.stringify(result).slice(0, 2000));
  process.exit(1);
}

const outPath = resolve(process.cwd(), "scripts/test-image-output.png");
writeFileSync(outPath, Buffer.from(image.b64_json, "base64"));
console.log("Saved:", outPath);
console.log("Usage:", JSON.stringify(result.usage ?? null));
console.log("Cost:", JSON.stringify(result.usage?.cost ?? result.cost ?? "not reported"));
