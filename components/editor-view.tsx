"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, CheckIcon, CopyIcon, EditIcon, RefreshIcon } from "./icons";
import { platformMeta } from "./mock-data";
import type { GeneratedContent, PlatformKey, PlatformStatus, RedNoteContent, TextPlatformContent } from "./types";

type PlatformContent = RedNoteContent | TextPlatformContent;

type EditorViewProps = {
  generation: GeneratedContent;
  statuses: Record<PlatformKey, PlatformStatus>;
  onBack: () => void;
  onSavePlatform: (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => Promise<void>;
  onRegeneratePlatform: (
    platform: PlatformKey,
    feedback: string,
    options?: { forceRecommended?: boolean },
  ) => Promise<void>;
  onApprove: (platform: PlatformKey, scheduledAt?: string) => Promise<void>;
};

const platformOrder: PlatformKey[] = ["rednote", "threads", "linkedin"];
const generateAnywayFeedback = "user wants to generate despite poor fit — find the best possible angle";

export function EditorView({
  generation,
  statuses,
  onBack,
  onSavePlatform,
  onRegeneratePlatform,
  onApprove,
}: EditorViewProps) {
  const platformsWithContent = platformOrder.filter((platform) => generation.platforms[platform]);
  const recommendedPlatforms = platformsWithContent.filter((platform) => generation.platforms[platform]?.recommended);
  const notRecommendedPlatforms = platformsWithContent.filter((platform) => !generation.platforms[platform]?.recommended);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-7 lg:px-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-ink"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Brief
      </button>

      <div className="mb-7 rounded-lg border border-line bg-white p-5 shadow-workspace">
        <p className="text-sm font-medium text-muted">Content Type</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{generation.contentAnalysis.contentType}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">{generation.contentAnalysis.summary}</p>
      </div>

      <div className="space-y-8">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Recommended Platforms</h2>
            <span className="text-sm font-medium text-muted">{recommendedPlatforms.length} ready to review</span>
          </div>
          <div className="space-y-4">
            {recommendedPlatforms.length ? (
              recommendedPlatforms.map((platform) => {
                const content = generation.platforms[platform];
                if (!content) return null;
                return (
                  <RecommendedPlatformCard
                    key={platform}
                    platform={platform}
                    content={content}
                    status={statuses[platform]}
                    onSavePlatform={onSavePlatform}
                    onRegeneratePlatform={onRegeneratePlatform}
                    onApprove={onApprove}
                  />
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted">
                No platforms were recommended for this brief yet.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Not Recommended</h2>
            <span className="text-sm font-medium text-muted">{notRecommendedPlatforms.length} poor fit</span>
          </div>
          <div className="space-y-3">
            {notRecommendedPlatforms.length ? (
              notRecommendedPlatforms.map((platform) => {
                const content = generation.platforms[platform];
                if (!content) return null;
                return (
                  <NotRecommendedPlatformCard
                    key={platform}
                    platform={platform}
                    content={content}
                    onRegeneratePlatform={onRegeneratePlatform}
                  />
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted">
                Every platform is currently recommended.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function RecommendedPlatformCard({
  platform,
  content,
  status,
  onSavePlatform,
  onRegeneratePlatform,
  onApprove,
}: {
  platform: PlatformKey;
  content: PlatformContent;
  status: PlatformStatus;
  onSavePlatform: (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => Promise<void>;
  onRegeneratePlatform: (
    platform: PlatformKey,
    feedback: string,
    options?: { forceRecommended?: boolean },
  ) => Promise<void>;
  onApprove: (platform: PlatformKey, scheduledAt?: string) => Promise<void>;
}) {
  const [expandedSlide, setExpandedSlide] = useState<number>(1);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<PlatformContent | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingPlatform, setIsRegeneratingPlatform] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [shouldSchedule, setShouldSchedule] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState(() => defaultScheduleDateTime());
  const [error, setError] = useState<string | null>(null);

  const displayedContent = (isEditing && draftContent ? draftContent : content) as PlatformContent;
  const meta = platformMeta[platform];

  useEffect(() => {
    setIsEditing(false);
    setDraftContent(null);
    setIsRegenerating(false);
    setFeedback("");
    setShouldSchedule(false);
    setScheduleDateTime(defaultScheduleDateTime());
    setError(null);
  }, [platform, content]);

  const copyText = useMemo(() => getPlatformCopy(platform, displayedContent), [displayedContent, platform]);

  const handleCopy = async () => {
    if (!copyText) return;
    await navigator.clipboard?.writeText(copyText);
  };

  const startEditing = () => {
    setDraftContent(cloneContent(displayedContent));
    setIsEditing(true);
    setError(null);
  };

  const cancelEditing = () => {
    setDraftContent(null);
    setIsEditing(false);
    setError(null);
  };

  const saveEditing = async () => {
    if (!draftContent) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSavePlatform(platform, draftContent);
      setIsEditing(false);
      setDraftContent(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not save edits.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const submitRegeneration = async () => {
    if (!feedback.trim()) {
      setError("Add feedback before regenerating.");
      return;
    }

    setIsRegeneratingPlatform(true);
    setError(null);
    try {
      await onRegeneratePlatform(platform, feedback.trim());
      setFeedback("");
      setIsRegenerating(false);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not regenerate content.";
      setError(message);
    } finally {
      setIsRegeneratingPlatform(false);
    }
  };

  const approvePost = async () => {
    if (shouldSchedule && !scheduleDateTime) {
      setError("Choose a date and time before scheduling.");
      return;
    }

    setIsApproving(true);
    setError(null);
    try {
      await onApprove(platform, shouldSchedule ? new Date(scheduleDateTime).toISOString() : undefined);
      setShouldSchedule(false);
      setScheduleDateTime(defaultScheduleDateTime());
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not approve this post.";
      setError(message);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-workspace">
      <div className="mb-5 flex flex-col justify-between gap-3 border-b border-line pb-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
            <h3 className="text-lg font-semibold text-ink">{meta.label}</h3>
          </div>
          <p className="mt-2 text-sm text-muted">Angle: {displayedContent.angle}</p>
        </div>
        <span className="w-fit rounded-md border border-line bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {statusLabel(status)}
        </span>
      </div>

      {platform === "rednote" ? (
        <RedNotePanel
          content={displayedContent as RedNoteContent}
          expandedSlide={expandedSlide}
          isEditing={isEditing}
          onExpandSlide={setExpandedSlide}
          onChange={setDraftContent}
        />
      ) : (
        <TextPlatformPanel
          content={displayedContent as TextPlatformContent}
          isEditing={isEditing}
          platform={platform}
          onChange={setDraftContent}
        />
      )}

      {isRegenerating ? (
        <div className="mt-5 rounded-md border border-line bg-slate-50 p-3">
          <label className="block text-sm font-medium text-ink">What should change?</label>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
            placeholder="e.g. Make this more strategic and less tutorial-like."
            className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />
          <div className="mt-3 flex gap-2">
            <ActionButton
              label={isRegeneratingPlatform ? "Regenerating..." : "Send Feedback"}
              onClick={submitRegeneration}
              disabled={isRegeneratingPlatform}
              strong
            />
            <ActionButton
              label="Cancel"
              onClick={() => {
                setIsRegenerating(false);
                setFeedback("");
                setError(null);
              }}
              disabled={isRegeneratingPlatform}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <ActionButton icon={<CopyIcon className="h-4 w-4" />} label="Copy" onClick={handleCopy} />
        {isEditing ? (
          <>
            <ActionButton label={isSaving ? "Saving..." : "Save"} onClick={saveEditing} disabled={isSaving} strong />
            <ActionButton label="Cancel" onClick={cancelEditing} disabled={isSaving} />
          </>
        ) : (
          <ActionButton icon={<EditIcon className="h-4 w-4" />} label="Edit" onClick={startEditing} />
        )}
        <ActionButton
          icon={<RefreshIcon className="h-4 w-4" />}
          label="Regenerate"
          onClick={() => {
            setIsRegenerating((value) => !value);
            setError(null);
          }}
          disabled={isRegeneratingPlatform}
        />
        <ActionButton
          icon={<CheckIcon className="h-4 w-4" />}
          label={isApproving ? "Approving..." : status === "approved" ? "Approved" : shouldSchedule ? "Approve + Schedule" : "Approve"}
          onClick={approvePost}
          disabled={isApproving}
          strong
        />
      </div>

      <div className="mt-4 rounded-md border border-line bg-slate-50 p-3">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={shouldSchedule}
            onChange={(event) => setShouldSchedule(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-line text-ink"
          />
          <span>
            <span className="block font-semibold">Schedule this post</span>
            <span className="mt-1 block text-muted">Pick a date and time when approving to add it to the calendar.</span>
          </span>
        </label>
        {shouldSchedule ? (
          <label className="mt-3 block text-sm font-semibold text-ink">
            Date and time
            <input
              type="datetime-local"
              value={scheduleDateTime}
              onChange={(event) => setScheduleDateTime(event.target.value)}
              className="mt-2 block h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-medium text-ink outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 sm:w-72"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function NotRecommendedPlatformCard({
  platform,
  content,
  onRegeneratePlatform,
}: {
  platform: PlatformKey;
  content: PlatformContent;
  onRegeneratePlatform: (
    platform: PlatformKey,
    feedback: string,
    options?: { forceRecommended?: boolean },
  ) => Promise<void>;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = platformMeta[platform];

  const generateAnyway = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await onRegeneratePlatform(platform, generateAnywayFeedback, { forceRecommended: true });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not generate this platform.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
            <h3 className="text-base font-semibold text-ink">{meta.label}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">{content.skipReason || "The AI marked this platform as a poor fit."}</p>
        </div>
        <button
          type="button"
          onClick={generateAnyway}
          disabled={isGenerating}
          className={`inline-flex h-10 shrink-0 items-center justify-center rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${meta.borderClass} ${meta.colorClass} bg-white`}
        >
          {isGenerating ? "Generating..." : "Generate anyway"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RedNotePanel({
  content,
  expandedSlide,
  isEditing,
  onExpandSlide,
  onChange,
}: {
  content: RedNoteContent;
  expandedSlide: number;
  isEditing: boolean;
  onExpandSlide: (slide: number) => void;
  onChange: (content: RedNoteContent) => void;
}) {
  const activeSlide = content.carouselSlides.find((slide) => slide.slideNumber === expandedSlide);

  return (
    <div className="space-y-5">
      <EditableBlock
        label="Angle"
        value={content.angle}
        rows={2}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, angle: value })}
      />
      <EditableBlock
        label="Title"
        value={content.title}
        rows={1}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, title: value })}
      />
      <EditableBlock
        label="Caption"
        value={content.caption}
        rows={7}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, caption: value })}
      />

      <div>
        <p className="mb-3 text-sm font-semibold text-ink">Carousel Slides</p>
        <div className="flex flex-wrap gap-2">
          {content.carouselSlides.map((slide) => (
            <button
              type="button"
              key={slide.slideNumber}
              onClick={() => onExpandSlide(slide.slideNumber)}
              className={`flex h-16 w-16 items-center justify-center rounded-md border text-sm font-semibold transition ${
                expandedSlide === slide.slideNumber
                  ? "border-rednote bg-rose-50 text-rednote ring-4 ring-rose-100"
                  : "border-line bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {slide.slideNumber}
            </button>
          ))}
        </div>
        {activeSlide ? (
          <div className="mt-3 rounded-md border border-line bg-slate-50 p-4">
            {isEditing ? (
              <div className="space-y-3">
                <EditableBlock
                  label="Slide Content"
                  value={activeSlide.content}
                  rows={3}
                  isEditing
                  onChange={(value) =>
                    onChange({
                      ...content,
                      carouselSlides: content.carouselSlides.map((slide) =>
                        slide.slideNumber === activeSlide.slideNumber ? { ...slide, content: value } : slide,
                      ),
                    })
                  }
                />
                <EditableBlock
                  label="Design Note"
                  value={activeSlide.designNote}
                  rows={3}
                  isEditing
                  onChange={(value) =>
                    onChange({
                      ...content,
                      carouselSlides: content.carouselSlides.map((slide) =>
                        slide.slideNumber === activeSlide.slideNumber ? { ...slide, designNote: value } : slide,
                      ),
                    })
                  }
                />
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">{activeSlide.content}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{activeSlide.designNote}</p>
              </>
            )}
          </div>
        ) : null}
      </div>

      <EditableBlock
        label="Hashtags"
        value={content.hashtags.join(" ")}
        rows={2}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, hashtags: splitHashtags(value) })}
      />
      <EditableBlock
        label="Posting Tips"
        value={content.postingTips}
        rows={3}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, postingTips: value })}
      />
    </div>
  );
}

function TextPlatformPanel({
  content,
  isEditing,
  platform,
  onChange,
}: {
  content: TextPlatformContent;
  isEditing: boolean;
  platform: PlatformKey;
  onChange: (content: TextPlatformContent) => void;
}) {
  return (
    <div className="space-y-5">
      <EditableBlock
        label="Angle"
        value={content.angle}
        rows={2}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, angle: value })}
      />
      <EditableBlock
        label="Post Text"
        value={content.content}
        rows={9}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, content: value })}
      />
      {platform === "linkedin" || content.hashtags?.length ? (
        <EditableBlock
          label="Hashtags"
          value={content.hashtags?.join(" ") ?? ""}
          rows={2}
          isEditing={isEditing}
          onChange={(value) => onChange({ ...content, hashtags: splitHashtags(value) })}
        />
      ) : null}
      <EditableBlock
        label="Posting Tips"
        value={content.postingTips}
        rows={3}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, postingTips: value })}
      />
    </div>
  );
}

function EditableBlock({
  label,
  value,
  rows,
  isEditing,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  isEditing: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-ink">{label}</span>
      {isEditing ? (
        <textarea
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          rows={rows}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        />
      ) : (
        <div className="whitespace-pre-wrap rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink">
          {value}
        </div>
      )}
    </label>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  strong = false,
  disabled = false,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  strong?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
        strong
          ? "bg-ink text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          : "border border-line bg-white text-ink hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function getPlatformCopy(platform: PlatformKey, content: PlatformContent) {
  if (platform === "rednote" && "caption" in content) {
    return `${content.title}\n\n${content.caption}\n\n${content.hashtags.join(" ")}`;
  }

  if ("content" in content) {
    return `${content.content}${content.hashtags?.length ? `\n\n${content.hashtags.join(" ")}` : ""}`;
  }

  return "";
}

function cloneContent<T extends PlatformContent>(content: T): T {
  return JSON.parse(JSON.stringify(content)) as T;
}

function splitHashtags(value: string) {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultScheduleDateTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

function toDateTimeLocalValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function statusLabel(status: PlatformStatus) {
  if (status === "recommended") return "Recommended";
  if (status === "skip") return "Not recommended";
  if (status === "approved") return "Approved";
  return "Alt angle";
}
