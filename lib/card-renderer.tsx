import { readFileSync } from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

export type CardPreset = "linkedin" | "rednote";

export type CardBackground = {
  type: "solid" | "gradient" | "image";
  // 1 colour for solid, 2+ for gradient. Defaults derive from style.
  colors?: string[];
  // Data URL or HTTPS URL, used when type is "image" (fills the card, scrim added).
  imageUrl?: string;
};

export type CardSpec = {
  preset: CardPreset;
  layout: "cover" | "asset_frame";
  style: "dark" | "light";
  accentColor?: string;
  background?: CardBackground;
  title: string;
  subtitle?: string | null;
  bullets?: string[];
  // asset_frame only: the framed image (data URL or HTTPS URL).
  assetImage?: string;
  // asset_frame: where the title sits relative to the asset.
  // cover: where media cards sit relative to the text block.
  titlePosition?: "above" | "below";
  // cover only: framed media cards rendered inside the slide (RedNote carousel).
  media?: Array<{
    url: string;
    fit: "contain" | "cover";
    caption?: string | null;
  }>;
  // cover only: text alignment (default left).
  align?: "left" | "center";
  // cover only: extra editorial text slots.
  eyebrow?: string | null;
  productName?: string | null;
  footer?: string | null;
  // cover only: composition controls from the slide planner.
  headlineScale?: "hero" | "large" | "medium";
  mediaWidthPct?: number;
  mediaHeightPct?: number;
  // When false, body lines render as plain editorial lines without bullet dots.
  bulletDots?: boolean;
};

const PRESET_SIZES: Record<CardPreset, { width: number; height: number }> = {
  linkedin: { width: 1080, height: 1350 },
  rednote: { width: 1080, height: 1440 },
};

const MARGIN = 96;

type Palette = {
  base: string;
  text: string;
  subtext: string;
  gradient: [string, string];
};

const PALETTES: Record<CardSpec["style"], Palette> = {
  dark: {
    base: "#16161d",
    text: "#f5f5f2",
    subtext: "rgba(245,245,242,0.72)",
    gradient: ["#16161d", "#26263a"],
  },
  light: {
    base: "#f7f5f0",
    text: "#1a1a22",
    subtext: "rgba(26,26,34,0.68)",
    gradient: ["#f7f5f0", "#e9e4d8"],
  },
};

let cachedFonts: Array<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }> | null = null;

function loadFonts() {
  if (cachedFonts) return cachedFonts;

  const fontsDir = path.join(process.cwd(), "assets", "fonts");
  cachedFonts = [
    { name: "Inter", data: readFileSync(path.join(fontsDir, "Inter-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Inter", data: readFileSync(path.join(fontsDir, "Inter-Bold.ttf")), weight: 700, style: "normal" },
    {
      name: "Noto Sans SC",
      data: readFileSync(path.join(fontsDir, "NotoSansSC-Regular.otf")),
      weight: 400,
      style: "normal",
    },
    {
      name: "Noto Sans SC",
      data: readFileSync(path.join(fontsDir, "NotoSansSC-Bold.otf")),
      weight: 700,
      style: "normal",
    },
    {
      name: "Noto Emoji",
      data: readFileSync(path.join(fontsDir, "NotoEmoji-Regular.ttf")),
      weight: 400,
      style: "normal",
    },
  ];
  return cachedFonts;
}

export async function renderCardPng(spec: CardSpec): Promise<Buffer> {
  const { width, height } = PRESET_SIZES[spec.preset];
  const cleaned: CardSpec = {
    ...spec,
    title: cleanRenderText(spec.title),
    subtitle: spec.subtitle ? cleanRenderText(spec.subtitle) : spec.subtitle,
    bullets: spec.bullets?.map(cleanRenderText),
    eyebrow: spec.eyebrow ? cleanRenderText(spec.eyebrow) : spec.eyebrow,
    productName: spec.productName ? cleanRenderText(spec.productName) : spec.productName,
    footer: spec.footer ? cleanRenderText(spec.footer) : spec.footer,
    media: spec.media?.map((item) => ({
      ...item,
      caption: item.caption ? cleanRenderText(item.caption) : item.caption,
    })),
  };

  const svg = await satori(buildCard(cleaned, width, height), {
    width,
    height,
    fonts: loadFonts(),
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return Buffer.from(resvg.render().asPng());
}

// The bundled Noto Emoji is monochrome and has no glyphs for skin-tone modifiers,
// variation selectors, or ZWJ sequences — strip them so emoji render without tofu.
function cleanRenderText(text: string) {
  return text.replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}]/gu, "");
}

function buildCard(spec: CardSpec, width: number, height: number) {
  const palette = PALETTES[spec.style];
  const accent = spec.accentColor?.trim() || "#6d5ef2";
  const isImageBackground = spec.background?.type === "image" && Boolean(spec.background.imageUrl);

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "Inter, 'Noto Sans SC', 'Noto Emoji'",
        ...backgroundStyle(spec.background, palette),
      }}
    >
      {isImageBackground ? (
        <img
          src={spec.background!.imageUrl}
          width={width}
          height={height}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
        />
      ) : null}
      {isImageBackground ? (
        // Scrim keeps typeset text readable over arbitrary imagery.
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            background:
              spec.style === "dark"
                ? "linear-gradient(180deg, rgba(10,10,16,0.72) 0%, rgba(10,10,16,0.92) 100%)"
                : "linear-gradient(180deg, rgba(250,249,245,0.82) 0%, rgba(250,249,245,0.95) 100%)",
          }}
        />
      ) : null}

      {spec.layout === "asset_frame" ? assetFrameLayout(spec, palette, accent, width, height) : coverLayout(spec, palette, accent, width, height)}
    </div>
  );
}

function coverLayout(spec: CardSpec, palette: Palette, accent: string, width: number, height: number) {
  const bullets = (spec.bullets ?? []).slice(0, 5);
  const media = (spec.media ?? []).slice(0, 3);
  const centered = spec.align === "center";
  const bulletDots = spec.bulletDots !== false;
  const titleSize = headlineSize(spec, media.length > 0);
  const mediaAboveText = spec.titlePosition === "below";

  const textBlock = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: centered ? "center" : "flex-start",
      }}
    >
      {spec.eyebrow ? (
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: accent,
            marginBottom: 28,
          }}
        >
          {spec.eyebrow}
        </div>
      ) : (
        <div style={{ display: "flex", width: 120, height: 12, backgroundColor: accent, borderRadius: 6 }} />
      )}
      <div
        style={{
          display: "flex",
          marginTop: spec.eyebrow ? 0 : 44,
          fontSize: titleSize,
          fontWeight: 700,
          lineHeight: 1.15,
          color: palette.text,
          letterSpacing: "-0.02em",
          textAlign: centered ? "center" : "left",
        }}
      >
        {spec.title}
      </div>
      {spec.productName ? (
        <div
          style={{
            display: "flex",
            marginTop: 26,
            fontSize: Math.round(titleSize * 0.82),
            fontWeight: 700,
            lineHeight: 1.1,
            color: accent,
            letterSpacing: "-0.01em",
          }}
        >
          {spec.productName}
        </div>
      ) : null}
      {spec.subtitle ? (
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: media.length ? 38 : 42,
            fontWeight: 400,
            lineHeight: 1.35,
            color: palette.subtext,
            textAlign: centered ? "center" : "left",
          }}
        >
          {spec.subtitle}
        </div>
      ) : null}
      {bullets.length ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: media.length ? 40 : 64,
            gap: media.length ? 26 : 34,
          }}
        >
          {bullets.map((bullet, index) => (
            <div key={index} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 28 }}>
              {bulletDots ? (
                <div
                  style={{
                    display: "flex",
                    width: 16,
                    height: 16,
                    marginTop: 14,
                    backgroundColor: accent,
                    borderRadius: 8,
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <div style={{ display: "flex", fontSize: media.length ? 36 : 40, lineHeight: 1.4, color: palette.text }}>
                {bullet}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const mediaBlock = media.length ? mediaCards(media, spec, width, height) : null;
  const footerBlock = spec.footer ? (
    <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: palette.subtext }}>{spec.footer}</div>
  ) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: media.length ? "flex-start" : "center",
        flexGrow: 1,
        padding: MARGIN,
        position: "relative",
        gap: media.length ? 56 : 0,
        ...(media.length ? { paddingTop: MARGIN + 24 } : {}),
      }}
    >
      {mediaAboveText ? mediaBlock : textBlock}
      {media.length ? <div style={{ display: "flex", flexGrow: 1 }} /> : null}
      {mediaAboveText ? textBlock : mediaBlock}
      {footerBlock}
    </div>
  );
}

function headlineSize(spec: CardSpec, hasMedia: boolean) {
  const long = spec.title.length > 34;
  const veryLong = spec.title.length > 60;

  if (spec.headlineScale === "hero") return long ? 76 : 92;
  if (spec.headlineScale === "large") return long ? 56 : 68;
  if (spec.headlineScale === "medium") return 48;

  if (hasMedia) return long ? 56 : 68;
  return veryLong ? 64 : long ? 76 : 88;
}

// Real uploaded assets rendered as rounded media cards on the slide.
function mediaCards(media: NonNullable<CardSpec["media"]>, spec: CardSpec, width: number, height: number) {
  const style = spec.style;
  const usableWidth = width - MARGIN * 2;
  const widthPct = clampPct(spec.mediaWidthPct, 40, 100) ?? 100;
  const rowWidth = Math.round((usableWidth * widthPct) / 100);
  const gap = 24;
  const itemWidth = Math.floor((rowWidth - gap * (media.length - 1)) / media.length);
  const heightPct = clampPct(spec.mediaHeightPct, 15, 62);
  const itemHeight = heightPct
    ? Math.round((height * heightPct) / 100)
    : media.length === 1
      ? Math.round(height * 0.46)
      : Math.round(height * 0.34);
  const frameBackground = style === "dark" ? "#0e0e15" : "#ffffff";
  const border = style === "dark" ? "2px solid rgba(255,255,255,0.14)" : "2px solid rgba(0,0,0,0.08)";

  return (
    <div style={{ display: "flex", flexDirection: "row", gap, width: usableWidth, justifyContent: "center" }}>
      {media.map((item, index) => (
        <div key={index} style={{ display: "flex", flexDirection: "column", width: itemWidth, gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: itemWidth,
              height: itemHeight,
              borderRadius: 24,
              overflow: "hidden",
              backgroundColor: frameBackground,
              border,
              boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
            }}
          >
            <img src={item.url} width={itemWidth} height={itemHeight} style={{ objectFit: item.fit }} />
          </div>
          {item.caption ? (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                lineHeight: 1.4,
                color: style === "dark" ? "rgba(245,245,242,0.72)" : "rgba(26,26,34,0.68)",
              }}
            >
              {item.caption}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function clampPct(value: number | undefined, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.min(Math.max(value, min), max);
}

function assetFrameLayout(spec: CardSpec, palette: Palette, accent: string, width: number, height: number) {
  const frameWidth = width - MARGIN * 2;
  const frameHeight = Math.round(height * 0.58);
  const titleBelow = spec.titlePosition === "below";

  const titleBlock = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", width: 120, height: 12, backgroundColor: accent, borderRadius: 6 }} />
      <div
        style={{
          display: "flex",
          marginTop: 44,
          fontSize: spec.title.length > 50 ? 56 : 66,
          fontWeight: 700,
          lineHeight: 1.18,
          color: palette.text,
          letterSpacing: "-0.02em",
        }}
      >
        {spec.title}
      </div>
      {spec.subtitle ? (
        <div style={{ display: "flex", marginTop: 24, fontSize: 38, lineHeight: 1.35, color: palette.subtext }}>
          {spec.subtitle}
        </div>
      ) : null}
    </div>
  );

  const frameBlock = spec.assetImage ? (
    <div
      style={{
        display: "flex",
        width: frameWidth,
        height: frameHeight,
        borderRadius: 28,
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        border: spec.style === "dark" ? "2px solid rgba(255,255,255,0.14)" : "2px solid rgba(0,0,0,0.08)",
      }}
    >
      <img src={spec.assetImage} width={frameWidth} height={frameHeight} style={{ objectFit: "cover" }} />
    </div>
  ) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        padding: MARGIN,
        position: "relative",
      }}
    >
      {titleBelow ? frameBlock : titleBlock}
      <div style={{ display: "flex", flexGrow: 1 }} />
      {titleBelow ? titleBlock : frameBlock}
    </div>
  );
}

function backgroundStyle(background: CardBackground | undefined, palette: Palette) {
  if (!background || background.type === "image") {
    return { backgroundColor: palette.base };
  }

  if (background.type === "solid") {
    return { backgroundColor: background.colors?.[0] ?? palette.base };
  }

  const [from, to] =
    background.colors && background.colors.length >= 2
      ? [background.colors[0], background.colors[1]]
      : palette.gradient;
  return { background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)` };
}
