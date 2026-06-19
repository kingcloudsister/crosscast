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
  }>;
  postingTips: string;
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
};

export type GeneratedContent = {
  contentAnalysis: {
    contentType: string;
    summary: string;
  };
  platforms: {
    rednote?: RedNoteContent;
    threads?: TextPlatformContent;
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
