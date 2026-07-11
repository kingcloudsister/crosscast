export type PlatformKey = "rednote" | "threads" | "linkedin";

export type ViewKey = "create" | "editor" | "calendar" | "dashboard";

export type UploadedImage = {
  id: string;
  name: string;
  url: string;
};

export type BriefState = {
  theme: string;
  rawMaterial: string;
  additionalContext: string;
  images: UploadedImage[];
  selectedPlatforms: PlatformKey[];
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type SessionSummary = {
  id: string;
  date: string;
  title: string;
  brief: BriefState;
};

export type PlatformStatus = "recommended" | "skip" | "alternative" | "approved" | "posted";
export type ScheduledPostStatus = "scheduled" | "posted" | "draft" | "approved";

export type RedNoteSlideMedia = {
  assetRef: string;
  fit?: "contain" | "cover";
  crop?: "none" | "safe" | "detail";
  frame?: "none" | "paper" | "browser" | "phone" | "rounded";
  position?: "top" | "center" | "bottom" | "left" | "right";
  rotation?: number;
  annotation?: string | null;
};

export type RedNoteSlideSpec = {
  kind: "text_card" | "asset_card" | "collage" | "diagram" | "illustration";
  role: "cover" | "content" | "cta";
  layout?:
    | "text_only"
    | "hero_asset"
    | "title_above_asset"
    | "split"
    | "stacked"
    | "collage_2"
    | "collage_3"
    | "comparison"
    | "quote"
    | "process";
  background: {
    type: "solid" | "gradient" | "asset" | "ai";
    colors?: string[];
    assetRef?: string | null;
    ai_prompt?: string | null;
    // Storage URL of the AI-generated background, saved after first render so
    // re-renders reuse it instead of paying for a new generation.
    generatedUrl?: string | null;
  };
  media?: RedNoteSlideMedia[];
  text: {
    eyebrow?: string | null;
    title: string;
    productName?: string | null;
    subtitle?: string | null;
    body?: string[];
    footer?: string | null;
  };
  style?: {
    alignment?: "left" | "center";
    density?: "airy" | "normal";
    accentColor?: string;
    texture?: "none" | "subtle_paper";
    shadow?: "none" | "soft";
  };
  composition?: {
    headlineScale?: "hero" | "large" | "medium";
    mediaScale?: "hero" | "large" | "medium" | "small";
    mediaWidthPct?: number;
    mediaHeightPct?: number;
    textWidthPct?: number;
    verticalBalance?: "headline_heavy" | "balanced" | "media_heavy";
    allowBullets?: boolean;
    maxBulletCount?: number;
  };
  accent?: {
    icon?: string | null;
    avatar?: boolean;
    doodle?: "none" | "underline" | "arrow" | "circle" | "tape" | "highlight";
  };
};

export type RedNoteSlideImage = {
  slideNumber: number;
  url: string;
  renderedAt: string;
};

export type RedNoteContent = {
  recommended: boolean;
  recommendedReason?: string | null;
  skipReason: string | null;
  angle: string;
  title?: string;
  titleOptions?: string[];
  selectedTitleIndex?: number;
  caption: string;
  hashtags: string[];
  carouselSlides: Array<{
    slideNumber: number;
    content: string;
    designNote: string;
    spec?: RedNoteSlideSpec | null;
  }>;
  slideImages?: RedNoteSlideImage[] | null;
  postingTips: string;
};

export type PostImage = {
  url: string;
  generatedAt: string;
  instructions?: string | null;
};

export type TextPlatformContent = {
  recommended: boolean;
  recommendedReason?: string | null;
  skipReason: string | null;
  angle: string;
  content: string;
  hashtags?: string[];
  postingTips: string;
  linkedInPostId?: string;
  linkedInPostUrl?: string;
  linkedInPublishedAt?: string;
  image?: PostImage | null;
};

export type ThreadsContent = TextPlatformContent & {
  topicTag: string;
  topicAlternatives: string[];
};

export type GeneratedContent = {
  contentAnalysis: {
    contentType: string;
    summary: string;
  };
  platforms: {
    rednote?: RedNoteContent;
    threads?: ThreadsContent;
    linkedin?: TextPlatformContent;
  };
  generationIds?: Partial<Record<PlatformKey, string>>;
  platformStatuses?: Partial<Record<PlatformKey, PlatformStatus>>;
};

export type SessionDetail = SessionSummary & {
  generation: GeneratedContent | null;
};

export type ScheduledPost = {
  id: string;
  generationId: string | null;
  sessionId: string | null;
  platform: PlatformKey;
  title: string;
  scheduledAt: string;
  status: ScheduledPostStatus;
  content: string;
  postUrl?: string | null;
};
