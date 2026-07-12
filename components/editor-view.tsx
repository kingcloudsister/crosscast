"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeLinkedInPostUrl } from "@/lib/linkedin-url";
import { copyToClipboard } from "./clipboard";
import { ArrowLeftIcon, CheckIcon, CopyIcon, EditIcon, RefreshIcon } from "./icons";
import { platformMeta } from "./mock-data";
import type {
  BriefState,
  GeneratedContent,
  PlatformKey,
  PlatformStatus,
  PostImage,
  RedNoteContent,
  TextPlatformContent,
  ThreadsContent,
} from "./types";

type PlatformContent = RedNoteContent | TextPlatformContent | ThreadsContent;

type EditorViewProps = {
  brief: BriefState;
  generation: GeneratedContent;
  statuses: Record<PlatformKey, PlatformStatus>;
  onBack: () => void;
  onSavePlatform: (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => Promise<void>;
  onPatchPlatform: (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => void;
  onRegeneratePlatform: (
    platform: PlatformKey,
    feedback: string,
    options?: { forceRecommended?: boolean },
  ) => Promise<void>;
  onApprove: (platform: PlatformKey, scheduledAt?: string, contentOverride?: PlatformContent) => Promise<void>;
  onPublishLinkedIn: (contentOverride?: TextPlatformContent) => Promise<{ postUrl: string }>;
};

const platformOrder: PlatformKey[] = ["rednote", "threads", "linkedin"];
const generateAnywayFeedback =
  "Create the strongest native post for this platform. Do not mention that this platform was previously not recommended, that the user forced generation, or that this is a poor fit.";
const defaultRegenerationFeedback =
  "Regenerate this platform draft as a fresh version using the same brief and platform strategy. Keep the platform fit decision and JSON structure, but rewrite the actual post content instead of lightly editing the previous draft.";

export function EditorView({
  brief,
  generation,
  statuses,
  onBack,
  onSavePlatform,
  onPatchPlatform,
  onRegeneratePlatform,
  onApprove,
  onPublishLinkedIn,
}: EditorViewProps) {
  const platformsWithContent = platformOrder.filter((platform) => generation.platforms[platform]);
  const [activePlatform, setActivePlatform] = useState<PlatformKey | null>(null);
  const [isBriefOpen, setIsBriefOpen] = useState(false);

  // Default to the first recommended platform; re-derive when the generation changes.
  useEffect(() => {
    const preferred =
      platformsWithContent.find((platform) => generation.platforms[platform]?.recommended) ?? platformsWithContent[0] ?? null;
    setActivePlatform((current) => (current && platformsWithContent.includes(current) ? current : preferred));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  const activeContent = activePlatform ? generation.platforms[activePlatform] : null;

  return (
    <section className="mx-auto w-full max-w-[1040px] px-6 pb-10 pt-5">
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-workspace">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to brief"
          className="shrink-0 text-slate-700 transition hover:text-ink"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{brief.theme || "Untitled brief"}</p>
        {brief.images.length ? (
          <span className="shrink-0 text-xs font-semibold text-muted">{brief.images.length} images</span>
        ) : null}
        <button
          type="button"
          onClick={() => setIsBriefOpen((open) => !open)}
          className="shrink-0 rounded-md bg-canvas px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:text-violet"
        >
          {isBriefOpen ? "Hide brief ▴" : "View brief ▾"}
        </button>
      </div>

      {isBriefOpen ? <RawMaterialsPanel brief={brief} /> : null}

      {platformsWithContent.length ? (
        <>
          <div className="flex gap-2">
            {platformsWithContent.map((platform) => {
              const meta = platformMeta[platform];
              const isActive = platform === activePlatform;
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setActivePlatform(platform)}
                  className={`flex flex-1 items-center justify-center gap-2.5 rounded-t-lg px-4 py-3 text-sm transition ${
                    isActive
                      ? `border-b-2 bg-white font-bold text-ink ${meta.borderClass}`
                      : "bg-white/50 font-semibold text-muted hover:bg-white/80 hover:text-ink"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  {meta.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      statuses[platform] === "posted"
                        ? "bg-teal/10 text-teal"
                        : statuses[platform] === "approved"
                          ? "bg-violet/10 text-violet"
                          : "bg-canvas text-muted"
                    }`}
                  >
                    {statusLabel(statuses[platform])}
                  </span>
                </button>
              );
            })}
          </div>

          {activePlatform && activeContent ? (
            <PlatformReviewCard
              key={activePlatform}
              platform={activePlatform}
              content={activeContent}
              status={statuses[activePlatform]}
              generationId={generation.generationIds?.[activePlatform] ?? null}
              briefImages={brief.images}
              onSavePlatform={onSavePlatform}
              onPatchPlatform={onPatchPlatform}
              onRegeneratePlatform={onRegeneratePlatform}
              onApprove={onApprove}
              onPublishLinkedIn={onPublishLinkedIn}
            />
          ) : null}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted">
          No platform drafts were generated for this brief yet.
        </div>
      )}
    </section>
  );
}

function RawMaterialsPanel({ brief }: { brief: BriefState }) {
  const hasRawMaterial = brief.rawMaterial.trim().length > 0;
  const hasAdditionalContext = brief.additionalContext.trim().length > 0;
  const hasImages = brief.images.length > 0;

  return (
    <div className="mb-7 rounded-lg border border-line bg-white p-5 shadow-workspace">
      <p className="text-sm font-medium text-muted">Raw Materials</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">{brief.theme || "Untitled brief"}</h1>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted">Raw material</p>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-line bg-canvas px-3 py-2 text-sm leading-6 text-slate-700">
              {hasRawMaterial ? (
                <p className="whitespace-pre-wrap">{brief.rawMaterial}</p>
              ) : (
                <p className="text-muted">No raw material was saved for this brief.</p>
              )}
            </div>
          </div>

          {hasAdditionalContext ? (
            <div>
              <p className="text-xs font-semibold uppercase text-muted">Additional context</p>
              <div className="mt-2 rounded-md border border-line bg-canvas px-3 py-2 text-sm leading-6 text-slate-700">
                <p className="whitespace-pre-wrap">{brief.additionalContext}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-muted">Uploaded images</p>
          {hasImages ? (
            <div className="mt-2 grid grid-cols-2 gap-3">
              {brief.images.map((image) => (
                <a
                  key={image.id}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-md border border-line bg-canvas"
                >
                  <img src={image.url} alt={image.name} className="h-28 w-full object-cover transition group-hover:scale-[1.02]" />
                  <span className="block truncate border-t border-line bg-white px-2 py-1 text-xs text-muted">{image.name}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-dashed border-line bg-canvas px-3 py-8 text-center text-sm text-muted">
              No images uploaded.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 h-1 w-44 rounded-full bg-gradient-to-r from-violet via-coral to-amber" />
    </div>
  );
}

function PlatformReviewCard({
  platform,
  content,
  status,
  generationId,
  briefImages,
  onSavePlatform,
  onPatchPlatform,
  onRegeneratePlatform,
  onApprove,
  onPublishLinkedIn,
}: {
  platform: PlatformKey;
  content: PlatformContent;
  status: PlatformStatus;
  generationId: string | null;
  briefImages: BriefState["images"];
  onSavePlatform: (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => Promise<void>;
  onPatchPlatform: (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => void;
  onRegeneratePlatform: (
    platform: PlatformKey,
    feedback: string,
    options?: { forceRecommended?: boolean },
  ) => Promise<void>;
  onApprove: (platform: PlatformKey, scheduledAt?: string, contentOverride?: PlatformContent) => Promise<void>;
  onPublishLinkedIn: (contentOverride?: TextPlatformContent) => Promise<{ postUrl: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<PlatformContent | null>(null);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState(() =>
    platform === "rednote" ? getSelectedRedNoteTitleIndex(content as RedNoteContent) : 0,
  );
  const [selectedThreadsTopic, setSelectedThreadsTopic] = useState(() =>
    platform === "threads" ? getSelectedThreadsTopic(content as ThreadsContent) : "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingPlatform, setIsRegeneratingPlatform] = useState(false);
  const [isGeneratingAnyway, setIsGeneratingAnyway] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPublishingLinkedIn, setIsPublishingLinkedIn] = useState(false);
  const [linkedInPostUrl, setLinkedInPostUrl] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "selected">("idle");
  const [copyFallbackText, setCopyFallbackText] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState(() => getSuggestedPostingRecommendation(platform).dateTime);
  const [error, setError] = useState<string | null>(null);
  const scheduleInputRef = useRef<HTMLInputElement | null>(null);

  const displayedContent = (isEditing && draftContent ? draftContent : content) as PlatformContent;
  const selectedContent =
    platform === "rednote"
      ? withSelectedRedNoteTitle(displayedContent as RedNoteContent, selectedTitleIndex)
      : platform === "threads" && "content" in displayedContent
        ? withSelectedThreadsTopic(displayedContent as ThreadsContent, selectedThreadsTopic)
      : displayedContent;
  const meta = platformMeta[platform];
  const isRecommended = displayedContent.recommended;
  const recommendedReason = getRecommendedReason(platform, displayedContent);
  const postingRecommendation = useMemo(() => getSuggestedPostingRecommendation(platform), [platform]);

  useEffect(() => {
    setIsEditing(false);
    setDraftContent(null);
    setSelectedTitleIndex(platform === "rednote" ? getSelectedRedNoteTitleIndex(content as RedNoteContent) : 0);
    setSelectedThreadsTopic(platform === "threads" ? getSelectedThreadsTopic(content as ThreadsContent) : "");
    setIsGeneratingAnyway(false);
    setCopyStatus("idle");
    setCopyFallbackText(null);
    setLinkedInPostUrl(
      platform === "linkedin" && "content" in content
        ? normalizeLinkedInPostUrl(
            "linkedInPostUrl" in content && typeof content.linkedInPostUrl === "string" ? content.linkedInPostUrl : null,
            "linkedInPostId" in content && typeof content.linkedInPostId === "string" ? content.linkedInPostId : null,
          )
        : null,
    );
    setScheduleDateTime(getSuggestedPostingRecommendation(platform).dateTime);
    setError(null);
  }, [platform, content]);

  const copyText = useMemo(() => getPlatformCopy(platform, selectedContent), [selectedContent, platform]);

  const handleCopy = async () => {
    if (!copyText) return;
    setError(null);

    try {
      await copyToClipboard(copyText);
      setCopyStatus("copied");
      setCopyFallbackText(null);
      window.setTimeout(() => setCopyStatus("idle"), 1500);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not copy this post.";
      setCopyFallbackText(copyText);
      setCopyStatus("selected");
      setError(`${message} The post text is selected below so you can press Cmd+C.`);
    }
  };

  const startEditing = () => {
    setDraftContent(cloneContent(selectedContent));
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
      if (platform === "rednote") {
        setSelectedTitleIndex(getSelectedRedNoteTitleIndex(draftContent as RedNoteContent));
      } else if (platform === "threads") {
        setSelectedThreadsTopic(getSelectedThreadsTopic(draftContent as ThreadsContent));
      }
      setIsEditing(false);
      setDraftContent(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not save edits.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const selectRedNoteTitle = (index: number) => {
    setSelectedTitleIndex(index);
    if (platform === "rednote" && draftContent) {
      setDraftContent({
        ...(draftContent as RedNoteContent),
        selectedTitleIndex: index,
      });
    }
  };

  const selectThreadsTopic = (topic: string) => {
    setSelectedThreadsTopic(topic);
    if (platform === "threads" && draftContent && "content" in draftContent) {
      setDraftContent({
        ...(draftContent as ThreadsContent),
        topicTag: topic,
      });
    }
  };

  const regeneratePlatformDraft = async () => {
    setIsRegeneratingPlatform(true);
    setError(null);
    try {
      await onRegeneratePlatform(platform, defaultRegenerationFeedback);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not regenerate content.";
      setError(message);
    } finally {
      setIsRegeneratingPlatform(false);
    }
  };

  const generateAnyway = async () => {
    setIsGeneratingAnyway(true);
    setError(null);
    try {
      await onRegeneratePlatform(platform, generateAnywayFeedback, { forceRecommended: true });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not generate this platform.";
      setError(message);
    } finally {
      setIsGeneratingAnyway(false);
    }
  };

  const approvePost = async () => {
    const selectedScheduleDateTime = scheduleInputRef.current?.value || scheduleDateTime;

    if (!selectedScheduleDateTime || Number.isNaN(new Date(selectedScheduleDateTime).getTime())) {
      setError("Choose a valid date and time before approving.");
      return;
    }

    setIsApproving(true);
    setError(null);
    try {
      await onApprove(platform, new Date(selectedScheduleDateTime).toISOString(), selectedContent);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not approve this post.";
      setError(message);
    } finally {
      setIsApproving(false);
    }
  };

  const publishLinkedInPost = async () => {
    if (platform !== "linkedin" || !("content" in selectedContent)) return;

    setIsPublishingLinkedIn(true);
    setError(null);
    setLinkedInPostUrl(null);
    try {
      const result = await onPublishLinkedIn(selectedContent as TextPlatformContent);
      setLinkedInPostUrl(result.postUrl);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not publish to LinkedIn.";
      setError(message);
    } finally {
      setIsPublishingLinkedIn(false);
    }
  };

  return (
    <div className="rounded-b-lg rounded-tr-lg border border-line bg-white shadow-workspace">
      <div className="p-6">
        {!isRecommended ? (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={generateAnyway}
              disabled={isGeneratingAnyway}
              className={`inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${meta.borderClass} ${meta.colorClass} bg-white`}
            >
              {isGeneratingAnyway ? "Generating..." : "Generate anyway"}
            </button>
          </div>
        ) : null}
        {!isRecommended && displayedContent.skipReason ? (
          <div className="mb-4 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-sm leading-6 text-ink">
            {cleanInternalWorkflowPhrases(displayedContent.skipReason)}
          </div>
        ) : null}
        {isRecommended && recommendedReason ? (
          <div className="mb-4 rounded-md border border-teal/25 bg-teal/10 px-3 py-2 text-sm leading-6 text-ink">
            <span className="block text-xs font-semibold uppercase text-teal">Why recommended</span>
            <span className="mt-1 block">{recommendedReason}</span>
          </div>
        ) : null}

        {isRecommended ? (
          platform === "rednote" ? (
            <RedNotePanel
              content={displayedContent as RedNoteContent}
              isEditing={isEditing}
              selectedTitleIndex={selectedTitleIndex}
              generationId={generationId}
              briefImages={briefImages}
              onSelectTitle={selectRedNoteTitle}
              // Slide text stays editable outside Edit mode; those edits are persisted
              // by the render route, so they only need to live in local state here.
              onChange={(next) =>
                isEditing ? setDraftContent(next) : onPatchPlatform("rednote", next)
              }
              onSlideRevised={(slideNumber, spec, slideImage) => {
                const base = content as RedNoteContent;
                onPatchPlatform("rednote", {
                  ...base,
                  carouselSlides: base.carouselSlides.map((slide) =>
                    slide.slideNumber === slideNumber ? { ...slide, spec } : slide,
                  ),
                  slideImages: (base.slideImages ?? []).map((item) =>
                    item.slideNumber === slideNumber ? slideImage : item,
                  ),
                });
              }}
              onRendered={(slideImages, backgrounds) => {
                const base = content as RedNoteContent;
                const backgroundBySlide = new Map(backgrounds.map((item) => [item.slideNumber, item.url]));
                onPatchPlatform("rednote", {
                  ...base,
                  slideImages,
                  carouselSlides: base.carouselSlides.map((slide) => {
                    const url = backgroundBySlide.get(slide.slideNumber);
                    if (!url || !slide.spec) return slide;
                    return {
                      ...slide,
                      spec: { ...slide.spec, background: { ...slide.spec.background, generatedUrl: url } },
                    };
                  }),
                });
              }}
            />
          ) : (
            <TextPlatformPanel
              content={displayedContent as TextPlatformContent}
              isEditing={isEditing}
              platform={platform}
              selectedThreadsTopic={selectedThreadsTopic}
              onSelectThreadsTopic={selectThreadsTopic}
              onChange={setDraftContent}
            />
          )
        ) : (
          <div className="rounded-md border border-dashed border-line bg-canvas px-3 py-4 text-sm leading-6 text-muted">
            No draft was generated for this platform because it is not recommended for this brief. Use Generate anyway to
            create a post for this platform.
          </div>
        )}

        {isRecommended && platform === "linkedin" && "content" in displayedContent ? (
          <LinkedInImageSection
            content={content as TextPlatformContent}
            postText={(displayedContent as TextPlatformContent).content}
            generationId={generationId}
            briefImages={briefImages}
            onImageChange={(image) => onPatchPlatform("linkedin", { ...(content as TextPlatformContent), image })}
          />
        ) : null}

        {error ? (
          <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        {copyFallbackText ? (
          <textarea
            autoFocus
            readOnly
            value={copyFallbackText}
            onFocus={(event) => event.currentTarget.select()}
            ref={(node) => node?.select()}
            className="mt-3 h-32 w-full rounded-md border border-rose-200 bg-white px-3 py-2 text-sm leading-6 text-ink"
          />
        ) : null}
        {linkedInPostUrl ? (
          <p className="mt-5 rounded-md border border-teal/25 bg-teal/10 px-3 py-2 text-sm leading-6 text-ink">
            Published to LinkedIn.{" "}
            <a href={linkedInPostUrl} target="_blank" rel="noreferrer" className="font-semibold text-teal underline">
              View post
            </a>
          </p>
        ) : null}
      </div>

      {isRecommended ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-b-lg border-t border-line bg-white/95 px-6 py-3 backdrop-blur">
          <ActionButton
            icon={<CopyIcon className="h-4 w-4" />}
            label={copyStatus === "copied" ? "Copied" : copyStatus === "selected" ? "Selected" : "Copy"}
            onClick={handleCopy}
          />
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
            label={isRegeneratingPlatform ? "Regenerating..." : "Regenerate"}
            onClick={regeneratePlatformDraft}
            disabled={isRegeneratingPlatform}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              ref={scheduleInputRef}
              type="datetime-local"
              value={scheduleDateTime}
              onChange={(event) => setScheduleDateTime(event.target.value)}
              title={postingRecommendation.reason}
              className="h-10 rounded-md border border-line bg-canvas px-3 text-sm font-medium text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
            />
            <ActionButton
              icon={<CheckIcon className="h-4 w-4" />}
              label={isApproving ? "Approving..." : status === "posted" ? "Posted" : status === "approved" ? "Approved" : "Approve + Schedule"}
              onClick={approvePost}
              disabled={isApproving || status === "posted"}
              strong
            />
            {platform === "linkedin" && (status === "approved" || status === "posted") ? (
              <ActionButton
                label={
                  isPublishingLinkedIn ? "Posting..." : status === "posted" || linkedInPostUrl ? "Posted to LinkedIn" : "Post to LinkedIn"
                }
                onClick={publishLinkedInPost}
                disabled={isPublishingLinkedIn || status === "posted" || Boolean(linkedInPostUrl)}
                strong
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RedNotePanel({
  content,
  isEditing,
  selectedTitleIndex,
  generationId,
  briefImages,
  onSelectTitle,
  onChange,
  onSlideRevised,
  onRendered,
}: {
  content: RedNoteContent;
  isEditing: boolean;
  selectedTitleIndex: number;
  generationId: string | null;
  briefImages: BriefState["images"];
  onSelectTitle: (index: number) => void;
  onChange: (content: RedNoteContent) => void;
  onSlideRevised: (
    slideNumber: number,
    spec: NonNullable<RedNoteContent["carouselSlides"][number]["spec"]>,
    slideImage: NonNullable<RedNoteContent["slideImages"]>[number],
  ) => void;
  onRendered: (
    slideImages: NonNullable<RedNoteContent["slideImages"]>,
    backgrounds: Array<{ slideNumber: number; url: string }>,
  ) => void;
}) {
  const [showTitleOptions, setShowTitleOptions] = useState(false);
  const displayedAngle = cleanInternalWorkflowPhrases(content.angle);
  const titleOptions = getRedNoteTitleOptions(content);
  const selectedIndex = normalizeTitleIndex(selectedTitleIndex, titleOptions);
  const hasGeneratedTitleOptions = Array.isArray(content.titleOptions) && content.titleOptions.length > 1;

  const updateSelectedTitle = (value: string) => {
    if (hasGeneratedTitleOptions) {
      const nextOptions = [...titleOptions];
      nextOptions[selectedIndex] = value;
      onChange({
        ...content,
        titleOptions: nextOptions,
        selectedTitleIndex: selectedIndex,
      });
      return;
    }

    onChange({ ...content, title: value, selectedTitleIndex: 0 });
  };

  return (
    <div className="space-y-5">
      <EditableBlock
        label="Angle"
        value={displayedAngle}
        rows={2}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, angle: cleanInternalWorkflowPhrases(value) })}
      />
      {hasGeneratedTitleOptions ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="block text-sm font-semibold text-ink">Title</p>
            <button
              type="button"
              onClick={() => setShowTitleOptions((open) => !open)}
              className="text-xs font-semibold text-violet transition hover:underline"
            >
              {showTitleOptions ? "Hide options" : `${titleOptions.length - 1} more options`}
            </button>
          </div>
          {isEditing ? (
            <EditableBlock label="" value={titleOptions[selectedIndex] ?? ""} rows={1} isEditing onChange={updateSelectedTitle} />
          ) : (
            <p className="text-xl font-bold leading-7 text-ink">{titleOptions[selectedIndex] ?? ""}</p>
          )}
          {showTitleOptions ? (
            <div className="mt-3 space-y-2">
              {titleOptions.map((title, index) => {
                const selected = index === selectedIndex;
                return (
                  <button
                    type="button"
                    key={`${title}-${index}`}
                    onClick={() => {
                      onSelectTitle(index);
                      setShowTitleOptions(false);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm leading-6 transition ${
                      selected
                        ? "border-rednote bg-coral/10 text-ink ring-4 ring-coral/15"
                        : "border-line bg-white text-ink hover:border-violet/40"
                    }`}
                  >
                    <span className="mb-1 block text-xs font-semibold uppercase text-muted">Option {index + 1}</span>
                    <span className="block">{title}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <EditableBlock
          label="Title"
          value={titleOptions[selectedIndex] ?? ""}
          rows={1}
          isEditing={isEditing}
          onChange={updateSelectedTitle}
        />
      )}
      <EditableBlock
        label="Caption"
        value={content.caption}
        rows={7}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, caption: value })}
      />

      <CarouselSection
        content={content}
        generationId={generationId}
        briefImages={briefImages}
        onChange={onChange}
        onRendered={onRendered}
        onSlideRevised={onSlideRevised}
      />
    </div>
  );
}

function updateSlideSpecText(
  content: RedNoteContent,
  slideNumber: number,
  patch: Partial<NonNullable<RedNoteContent["carouselSlides"][number]["spec"]>["text"]>,
): RedNoteContent {
  return {
    ...content,
    carouselSlides: content.carouselSlides.map((slide) =>
      slide.slideNumber === slideNumber && slide.spec
        ? { ...slide, spec: { ...slide.spec, text: { ...slide.spec.text, ...patch } } }
        : slide,
    ),
  };
}

// The carousel is the real RedNote deliverable: one strip of images, one button,
// and everything per-slide happens on the selected image (comment, download,
// background, and a tucked-away direct text editor).
function CarouselSection({
  content,
  generationId,
  briefImages,
  onChange,
  onRendered,
  onSlideRevised,
}: {
  content: RedNoteContent;
  generationId: string | null;
  briefImages: BriefState["images"];
  onChange: (content: RedNoteContent) => void;
  onRendered: (
    slideImages: NonNullable<RedNoteContent["slideImages"]>,
    backgrounds: Array<{ slideNumber: number; url: string }>,
  ) => void;
  onSlideRevised: (
    slideNumber: number,
    spec: NonNullable<RedNoteContent["carouselSlides"][number]["spec"]>,
    slideImage: NonNullable<RedNoteContent["slideImages"]>[number],
  ) => void;
}) {
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renderableSlides = content.carouselSlides.filter((slide) => slide.spec?.text?.title);
  const slideImages = content.slideImages ?? [];
  const activeSlide =
    selectedSlide !== null ? content.carouselSlides.find((slide) => slide.slideNumber === selectedSlide) : null;
  const activeImage =
    selectedSlide !== null ? slideImages.find((item) => item.slideNumber === selectedSlide) : null;

  const renderSlides = async (regenerateBackgrounds: number[] = []) => {
    if (!generationId) {
      setError("Generate or load a saved RedNote post before rendering images.");
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rednote/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId,
          slides: renderableSlides.map((slide) => ({ slideNumber: slide.slideNumber, spec: slide.spec })),
          images: briefImages,
          regenerateBackgrounds,
        }),
      });
      const data = (await response.json()) as {
        slideImages?: RedNoteContent["slideImages"];
        backgrounds?: Array<{ slideNumber: number; url: string }>;
        error?: string;
      };

      if (!response.ok || !data.slideImages) {
        throw new Error(data.error ?? "Could not generate the carousel images.");
      }

      onRendered(data.slideImages, data.backgrounds ?? []);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not generate the carousel images.";
      setError(message);
    } finally {
      setIsBusy(false);
    }
  };

  const applyComment = async () => {
    if (!generationId || selectedSlide === null || !activeSlide?.spec || !comment.trim()) return;

    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rednote/slide-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId,
          slideNumber: selectedSlide,
          spec: activeSlide.spec,
          comment: comment.trim(),
          images: briefImages,
        }),
      });
      const data = (await response.json()) as {
        spec?: NonNullable<RedNoteContent["carouselSlides"][number]["spec"]>;
        slideImage?: NonNullable<RedNoteContent["slideImages"]>[number];
        error?: string;
      };

      if (!response.ok || !data.spec || !data.slideImage) {
        throw new Error(data.error ?? "Could not update the slide.");
      }

      onSlideRevised(selectedSlide, data.spec, data.slideImage);
      setComment("");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not update the slide.";
      setError(message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Carousel</p>
        {renderableSlides.length ? (
          <ActionButton
            icon={<RefreshIcon className="h-4 w-4" />}
            label={
              isBusy
                ? "Working..."
                : slideImages.length
                  ? "Re-render all"
                  : `Generate images (${renderableSlides.length})`
            }
            onClick={() => renderSlides()}
            disabled={isBusy}
            strong={!slideImages.length}
          />
        ) : null}
      </div>

      {!renderableSlides.length ? (
        <p className="rounded-md border border-dashed border-line bg-white px-3 py-3 text-sm leading-6 text-muted">
          This draft has no renderable slides yet. Regenerate the RedNote draft to get them.
        </p>
      ) : !slideImages.length ? (
        <p className="rounded-md border border-dashed border-line bg-white px-3 py-3 text-sm leading-6 text-muted">
          {renderableSlides.length} slides ready. Generate the images, then click any image to tweak it.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {slideImages.map((slide) => (
            <button
              type="button"
              key={slide.slideNumber}
              onClick={() => {
                setSelectedSlide(selectedSlide === slide.slideNumber ? null : slide.slideNumber);
                setComment("");
              }}
              className={`w-40 shrink-0 overflow-hidden rounded-md border text-left transition ${
                selectedSlide === slide.slideNumber
                  ? "border-rednote ring-4 ring-coral/15"
                  : "border-line hover:border-violet/40"
              }`}
            >
              <img src={slide.url} alt={`Slide ${slide.slideNumber}`} className="aspect-[3/4] w-full object-cover" />
              <span className="block border-t border-line bg-white px-2 py-1 text-xs font-semibold text-muted">
                {slide.slideNumber}
              </span>
            </button>
          ))}
        </div>
      )}

      {activeImage && activeSlide?.spec ? (
        <div className="mt-2 rounded-md border border-line bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-muted">Slide {activeImage.slideNumber}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => renderSlides([activeImage.slideNumber])}
                disabled={isBusy}
                title="Regenerate this slide image with the same text"
                className="text-xs font-semibold text-muted transition hover:text-violet disabled:opacity-60"
              >
                Redraw
              </button>
              <a
                href={`${activeImage.url}?download=slide-${activeImage.slideNumber}.png`}
                className="text-xs font-semibold text-violet hover:underline"
              >
                Download
              </a>
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              placeholder='这张图要改什么？例如 "标题口语一点" / "少两条bullet" / "背景亮一点"'
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
            />
            <ActionButton
              label={isBusy ? "..." : "Apply"}
              onClick={applyComment}
              disabled={isBusy || !comment.trim()}
              strong
            />
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted transition hover:text-violet">
              Edit text directly
            </summary>
            <div className="mt-2 space-y-2">
              <EditableBlock
                label="Title"
                value={activeSlide.spec.text.title}
                rows={1}
                isEditing
                onChange={(value) => onChange(updateSlideSpecText(content, activeSlide.slideNumber, { title: value }))}
              />
              <EditableBlock
                label="Subtitle"
                value={activeSlide.spec.text.subtitle ?? ""}
                rows={1}
                isEditing
                onChange={(value) =>
                  onChange(updateSlideSpecText(content, activeSlide.slideNumber, { subtitle: value || null }))
                }
              />
              <EditableBlock
                label="Body (one line per bullet)"
                value={(activeSlide.spec.text.body ?? []).join("\n")}
                rows={3}
                isEditing
                onChange={(value) =>
                  onChange(
                    updateSlideSpecText(content, activeSlide.slideNumber, {
                      body: value.split("\n").filter((line) => line.trim()),
                    }),
                  )
                }
              />
              <p className="text-xs leading-5 text-muted">Text edits are applied when you re-render.</p>
            </div>
          </details>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}

function TextPlatformPanel({
  content,
  isEditing,
  platform,
  selectedThreadsTopic,
  onSelectThreadsTopic,
  onChange,
}: {
  content: TextPlatformContent;
  isEditing: boolean;
  platform: PlatformKey;
  selectedThreadsTopic: string;
  onSelectThreadsTopic: (topic: string) => void;
  onChange: (content: TextPlatformContent) => void;
}) {
  const displayedAngle = cleanInternalWorkflowPhrases(content.angle);

  return (
    <div className="space-y-5">
      <EditableBlock
        label="Angle"
        value={displayedAngle}
        rows={2}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, angle: cleanInternalWorkflowPhrases(value) })}
      />
      <EditableBlock
        label="Post Text"
        value={content.content}
        rows={9}
        isEditing={isEditing}
        onChange={(value) => onChange({ ...content, content: value })}
      />
      {platform === "threads" ? (
        <ThreadsTopicSection
          content={content as ThreadsContent}
          isEditing={isEditing}
          selectedTopic={selectedThreadsTopic}
          onSelectTopic={onSelectThreadsTopic}
          onChange={(nextContent) => onChange(nextContent)}
        />
      ) : null}
    </div>
  );
}

function LinkedInImageSection({
  content,
  postText,
  generationId,
  briefImages,
  onImageChange,
}: {
  content: TextPlatformContent;
  postText: string;
  generationId: string | null;
  briefImages: BriefState["images"];
  onImageChange: (image: PostImage) => void;
}) {
  const image = content.image ?? null;
  const [instructions, setInstructions] = useState(image?.instructions ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInstructions(image?.instructions ?? "");
  }, [image]);

  const generate = async () => {
    if (!generationId) {
      setError("Generate or load a saved LinkedIn post before generating an image.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/linkedin/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId,
          postText,
          images: briefImages,
          instructions: instructions.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { image?: PostImage; error?: string };

      if (!response.ok || !data.image) {
        throw new Error(data.error ?? "Could not generate the LinkedIn image.");
      }

      onImageChange(data.image);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not generate the LinkedIn image.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mt-5 rounded-md border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Post Image</p>
        <ActionButton
          icon={<RefreshIcon className="h-4 w-4" />}
          label={isGenerating ? "Generating..." : image ? "Regenerate" : "Generate image"}
          onClick={generate}
          disabled={isGenerating}
          strong={!image}
        />
      </div>

      {image ? (
        <div className="mt-3 overflow-hidden rounded-md border border-line bg-white">
          <img src={image.url} alt="Generated LinkedIn post image" className="w-full object-contain" />
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-line bg-white px-3 py-4 text-sm leading-6 text-muted">
          No image yet. Generate composes one LinkedIn-ready image from the post text and your uploaded raw materials.
        </p>
      )}

      {image ? (
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={2}
          placeholder='What should change? e.g. "use the analytics screenshot as the hero", "no text in the image" — then Regenerate'
          className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
        />
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}

function ThreadsTopicSection({
  content,
  isEditing,
  selectedTopic,
  onSelectTopic,
  onChange,
}: {
  content: ThreadsContent;
  isEditing: boolean;
  selectedTopic: string;
  onSelectTopic: (topic: string) => void;
  onChange: (content: ThreadsContent) => void;
}) {
  const topicOptions = getThreadsTopicOptions(content);
  const currentTopic = selectedTopic || getSelectedThreadsTopic(content);

  const updateSelectedTopic = (value: string) => {
    onSelectTopic(value);
    onChange({
      ...content,
      topicTag: value,
    });
  };

  return (
    <div>
      <p className="mb-2 block text-sm font-semibold text-ink">Topic</p>
      {topicOptions.length ? (
        <div className="space-y-2">
          {topicOptions.map((topic, index) => {
            const selected = topic === currentTopic;
            const label = index === 0 ? "Primary" : `Alternative ${index}`;
            const optionClassName = `w-full rounded-md border px-3 py-2 text-left text-sm leading-6 transition ${
              selected
                ? "border-threads bg-teal/10 text-ink ring-4 ring-teal/15"
                : "border-line bg-white text-ink hover:border-violet/40"
            }`;

            if (selected && isEditing) {
              return (
                <label key={`${topic}-${index}`} className={`block ${optionClassName}`}>
                  <span className="mb-1 block text-xs font-semibold uppercase text-muted">{label}</span>
                  <textarea
                    value={topic}
                    onChange={(event) => updateSelectedTopic(event.target.value)}
                    rows={1}
                    aria-label={`${label} topic`}
                    className="block w-full resize-none border-0 bg-transparent p-0 text-sm leading-6 text-ink outline-none"
                  />
                </label>
              );
            }

            return (
              <button
                type="button"
                key={`${topic}-${index}`}
                onClick={() => updateSelectedTopic(topic)}
                className={optionClassName}
              >
                <span className="mb-1 block text-xs font-semibold uppercase text-muted">{label}</span>
                <span className="block">{topic}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function cleanInternalWorkflowPhrases(value: string) {
  return value
    .replace(/user has chosen to generate despite poor fit\.?\s*/gi, "")
    .replace(/user has chosen to proceed anyway\.?\s*/gi, "")
    .replace(/user has chosen to generate anyway\.?\s*/gi, "")
    .replace(/user requested generation despite poor fit\.?\s*/gi, "")
    .replace(/user requested generation anyway\.?\s*/gi, "")
    .replace(/user forced generation\.?\s*/gi, "")
    .replace(/despite poor fit\.?\s*/gi, "")
    .replace(/best possible angle:\s*/gi, "")
    .trim();
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
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
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
          ? "bg-violet text-white shadow-brand hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
          : "border border-line bg-white text-ink hover:border-violet/40 hover:text-violet disabled:cursor-not-allowed disabled:opacity-60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function getRecommendedReason(platform: PlatformKey, content: PlatformContent) {
  const explicitReason = content.recommendedReason?.trim();
  if (explicitReason) return explicitReason;
  if (!content.recommended) return "";

  if (platform === "rednote") {
    return "This brief has a concrete, saveable workflow and practical details that fit RedNote's audience.";
  }

  if (platform === "threads") {
    return "This brief can be framed as a personal work observation with a clear insight, which fits Threads' reflective style.";
  }

  return "This brief has enough professional context to become a polished GTM or startup-ops lesson for LinkedIn.";
}

function getRedNoteTitleOptions(content: RedNoteContent) {
  const titleOptions = Array.isArray(content.titleOptions)
    ? content.titleOptions.filter((title) => typeof title === "string" && title.trim().length > 0)
    : [];

  if (titleOptions.length) return titleOptions;
  if (content.title?.trim()) return [content.title];
  return [""];
}

function normalizeTitleIndex(index: number | undefined, titleOptions: string[]) {
  if (!titleOptions.length) return 0;
  if (typeof index !== "number" || !Number.isInteger(index)) return 0;
  return Math.min(Math.max(index, 0), titleOptions.length - 1);
}

function getSelectedRedNoteTitleIndex(content: RedNoteContent) {
  return normalizeTitleIndex(content.selectedTitleIndex, getRedNoteTitleOptions(content));
}

function getSelectedRedNoteTitle(content: RedNoteContent) {
  const titleOptions = getRedNoteTitleOptions(content);
  return titleOptions[getSelectedRedNoteTitleIndex(content)] ?? "";
}

function withSelectedRedNoteTitle(content: RedNoteContent, selectedTitleIndex: number): RedNoteContent {
  const titleOptions = getRedNoteTitleOptions(content);
  return {
    ...content,
    selectedTitleIndex: normalizeTitleIndex(selectedTitleIndex, titleOptions),
  };
}

function getThreadsTopicOptions(content: ThreadsContent) {
  const options = [
    typeof content.topicTag === "string" ? content.topicTag : "",
    ...(Array.isArray(content.topicAlternatives) ? content.topicAlternatives : []),
  ]
    .filter((topic): topic is string => typeof topic === "string")
    .map((topic) => topic.trim())
    .filter(Boolean);

  return Array.from(new Set(options)).slice(0, 3);
}

function getSelectedThreadsTopic(content: ThreadsContent) {
  const options = getThreadsTopicOptions(content);
  return typeof content.topicTag === "string" && content.topicTag.trim() ? content.topicTag.trim() : options[0] ?? "";
}

function withSelectedThreadsTopic(content: ThreadsContent, selectedTopic: string): ThreadsContent {
  const topicTag = selectedTopic.trim() || getSelectedThreadsTopic(content);
  return {
    ...content,
    topicTag,
    topicAlternatives: Array.isArray(content.topicAlternatives) ? content.topicAlternatives : [],
  };
}

function getPlatformCopy(platform: PlatformKey, content: PlatformContent) {
  if (platform === "rednote" && "caption" in content) {
    return `${getSelectedRedNoteTitle(content)}\n\n${content.caption}`;
  }

  if ("content" in content) {
    return content.content;
  }

  return "";
}

function cloneContent<T extends PlatformContent>(content: T): T {
  return JSON.parse(JSON.stringify(content)) as T;
}

type PostingWindow = {
  day: number;
  hour: number;
  minute: number;
};

const postingRecommendations: Record<PlatformKey, { windows: PostingWindow[]; reason: string }> = {
  rednote: {
    windows: [
      { day: 1, hour: 12, minute: 30 },
      { day: 2, hour: 12, minute: 30 },
      { day: 3, hour: 12, minute: 30 },
      { day: 4, hour: 12, minute: 30 },
      { day: 5, hour: 12, minute: 30 },
      { day: 6, hour: 10, minute: 0 },
      { day: 0, hour: 21, minute: 0 },
    ],
    reason:
      "Recommended because RedNote/XHS has strong lunch and evening active windows; workplace workflow posts fit the lunch break best.",
  },
  threads: {
    windows: [
      { day: 2, hour: 10, minute: 0 },
      { day: 3, hour: 12, minute: 0 },
      { day: 4, hour: 9, minute: 0 },
      { day: 5, hour: 10, minute: 0 },
      { day: 1, hour: 12, minute: 0 },
    ],
    reason:
      "Recommended because Threads engagement tends to peak in weekday morning and midday slots, especially Tuesday through Thursday.",
  },
  linkedin: {
    windows: [
      { day: 2, hour: 11, minute: 30 },
      { day: 3, hour: 11, minute: 30 },
      { day: 4, hour: 13, minute: 30 },
      { day: 1, hour: 13, minute: 0 },
      { day: 5, hour: 11, minute: 30 },
    ],
    reason:
      "Recommended because LinkedIn reach is strongest during weekday business windows, especially midweek around late morning to afternoon.",
  },
};

function getSuggestedPostingRecommendation(platform: PlatformKey) {
  const recommendation = postingRecommendations[platform];
  return {
    dateTime: toDateTimeLocalValue(getNextPostingWindow(recommendation.windows)),
    reason: recommendation.reason,
  };
}

function getNextPostingWindow(windows: PostingWindow[]) {
  const now = new Date();
  const minimumLeadTime = new Date(now.getTime() + 30 * 60_000);
  const candidates: Date[] = [];

  for (let daysAhead = 0; daysAhead <= 14; daysAhead += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + daysAhead);

    windows.forEach((window) => {
      if (date.getDay() !== window.day) return;

      const candidate = new Date(date);
      candidate.setHours(window.hour, window.minute, 0, 0);

      if (candidate.getTime() >= minimumLeadTime.getTime()) {
        candidates.push(candidate);
      }
    });
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? fallbackPostingDate(minimumLeadTime);
}

function fallbackPostingDate(minimumLeadTime: Date) {
  const date = new Date(minimumLeadTime);
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  return date;
}

function toDateTimeLocalValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function statusLabel(status: PlatformStatus) {
  if (status === "recommended") return "Recommended";
  if (status === "skip") return "Not recommended";
  if (status === "approved") return "Approved";
  if (status === "posted") return "Posted";
  return "Alt angle";
}
