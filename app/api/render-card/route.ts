import { renderCardPng, type CardSpec } from "@/lib/card-renderer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const spec = (await request.json()) as Partial<CardSpec>;

  if (!spec || typeof spec.title !== "string" || !spec.title.trim()) {
    return Response.json({ error: "A card title is required." }, { status: 400 });
  }

  try {
    const png = await renderCardPng({
      preset: spec.preset === "rednote" ? "rednote" : "linkedin",
      layout: spec.layout === "asset_frame" ? "asset_frame" : "cover",
      style: spec.style === "light" ? "light" : "dark",
      accentColor: typeof spec.accentColor === "string" ? spec.accentColor : undefined,
      background: spec.background,
      title: spec.title.trim(),
      subtitle: typeof spec.subtitle === "string" ? spec.subtitle : null,
      bullets: Array.isArray(spec.bullets) ? spec.bullets.filter((item) => typeof item === "string") : [],
      assetImage: typeof spec.assetImage === "string" ? spec.assetImage : undefined,
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not render the card.";
    console.error("[CardRenderer]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
