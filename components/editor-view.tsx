"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeLinkedInPostUrl } from "@/lib/linkedin-url";
import { getContentVariants, selectContentVariant, syncSelectedVariant } from "@/lib/content-variants";
import { copyToClipboard } from "./clipboard";
import { ArrowLeftIcon, CheckIcon, CopyIcon, RefreshIcon, XIcon } from "./icons";
import { platformMeta } from "./mock-data";
import type {
  BriefState,
  GeneratedContent,
  PlatformGenerationState,
  PlatformContent,
  PlatformKey,
  PlatformStatus,
  PostImage,
  RedNoteContent,
  TextPlatformContent,
  ThreadsContent,
} from "./types";

type EditorViewProps = {
  brief: BriefState;
  generation: GeneratedContent;
  statuses: Record<PlatformKey, PlatformStatus>;
  generationStates: Partial<Record<PlatformKey, PlatformGenerationState>>;
  generationErrors: Partial<Record<PlatformKey, string>>;
  onBack: () => void;
  onGeneratePlatform: (platform: PlatformKey) => Promise<void>;
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
type TextSelection = {
  start: number;
  end: number;
  text: string;
};

type CaptionFeedbackTarget =
  | { kind: "overall" }
  | ({ kind: "selection" } & TextSelection);

type CaptionFeedbackComment = {
  id: string;
  target: CaptionFeedbackTarget;
  feedback: string;
};

type CommentAnchor = {
  x: number;
  y: number;
};

type ImageFeedbackRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ImageFeedbackTarget =
  | { kind: "overall" }
  | { kind: "region"; region: ImageFeedbackRegion };

type ImageFeedbackComment = {
  id: string;
  target: ImageFeedbackTarget;
  feedback: string;
};

export function EditorView({
  brief,
  generation,
  statuses,
  generationStates,
  generationErrors,
  onBack,
  onGeneratePlatform,
  onSavePlatform,
  onPatchPlatform,
  onRegeneratePlatform,
  onApprove,
  onPublishLinkedIn,
}: EditorViewProps) {
  const selectedPlatforms = brief.selectedPlatforms.length
    ? platformOrder.filter((platform) => brief.selectedPlatforms.includes(platform))
    : platformOrder.filter((platform) => generation.platforms[platform]);
  const [activePlatform, setActivePlatform] = useState<PlatformKey | null>(null);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const isAnyPlatformGenerating = selectedPlatforms.some((platform) => generationStates[platform] === "generating");
  const generatedCount = selectedPlatforms.filter((platform) => generation.platforms[platform]).length;

  // Keep the selected tab stable as individual platform drafts arrive.
  useEffect(() => {
    const preferred =
      selectedPlatforms.find((platform) => generation.platforms[platform]?.recommended) ?? selectedPlatforms[0] ?? null;
    setActivePlatform((current) => (current && selectedPlatforms.includes(current) ? current : preferred));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.selectedPlatforms, generation]);

  return (
    <section className="mx-auto w-full max-w-[1320px] px-6 pb-10 pt-5">
      <div className="mb-7 flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-4 shadow-workspace">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to brief"
          className="shrink-0 text-slate-700 transition hover:text-ink"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink sm:text-xl">
          {brief.theme || "Untitled brief"}
        </p>
        {selectedPlatforms.length ? (
          <span className="shrink-0 rounded-full bg-[#d3eafa]/55 px-2.5 py-1 text-xs font-semibold text-[#536a91]">
            {generatedCount} of {selectedPlatforms.length} generated
          </span>
        ) : null}
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

      {selectedPlatforms.length ? (
        <>
          <div className="flex gap-2">
            {selectedPlatforms.map((platform) => {
              const meta = platformMeta[platform];
              const isActive = platform === activePlatform;
              const lifecycle = generationStates[platform] ?? (generation.platforms[platform] ? "generated" : "not_generated");
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
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${platformLifecycleClass(lifecycle, statuses[platform])}`}
                  >
                    {platformLifecycleLabel(lifecycle, statuses[platform])}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedPlatforms.map((platform) => {
            const content = generation.platforms[platform];
            const lifecycle = generationStates[platform] ?? (content ? "generated" : "not_generated");
            return (
              <div key={platform} className={activePlatform === platform ? "block" : "hidden"}>
                {content ? (
                  <PlatformReviewCard
                    platform={platform}
                    content={content}
                    status={statuses[platform]}
                    generationId={generation.generationIds?.[platform] ?? null}
                    briefImages={brief.images}
                    onSavePlatform={onSavePlatform}
                    onPatchPlatform={onPatchPlatform}
                    onRegeneratePlatform={onRegeneratePlatform}
                    onApprove={onApprove}
                    onPublishLinkedIn={onPublishLinkedIn}
                  />
                ) : (
                  <PlatformGenerationCard
                    platform={platform}
                    state={lifecycle}
                    error={generationErrors[platform] ?? null}
                    disabled={isAnyPlatformGenerating && lifecycle !== "generating"}
                    onGenerate={() => void onGeneratePlatform(platform)}
                  />
                )}
              </div>
            );
          })}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted">
          No platforms were selected for this brief. Return to the direction step and choose at least one platform.
        </div>
      )}
    </section>
  );
}

function PlatformGenerationCard({
  platform,
  state,
  error,
  disabled,
  onGenerate,
}: {
  platform: PlatformKey;
  state: PlatformGenerationState;
  error: string | null;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const meta = platformMeta[platform];
  const isGenerating = state === "generating";
  const isRetry = state === "error";

  return (
    <div className="overflow-hidden rounded-b-2xl border border-line bg-white shadow-workspace">
      <div className="grid min-h-[420px] place-items-center px-6 py-14 text-center">
        <div className="max-w-md">
          <span className={`mx-auto block h-3 w-3 rounded-full ${meta.dot}`} />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#9096b0]">
            {isRetry ? "Generation interrupted" : isGenerating ? "Creating draft" : "Ready when you are"}
          </p>
          <h2 className="mt-2 font-serif text-3xl text-ink">
            {isRetry ? `Try ${meta.label} again` : isGenerating ? `Writing for ${meta.label}…` : `Generate the ${meta.label} version`}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#70778f]">
            {isGenerating
              ? "Crosscast is adapting the confirmed narrative and tone across your selected platforms. You can switch tabs while it works."
              : `This creates only the ${meta.label} draft. Your other selected platforms will stay unchanged until you generate them.`}
          </p>

          {error ? (
            <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || disabled}
            className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8bade4] px-5 text-sm font-semibold text-ink shadow-brand transition hover:bg-[#7a9edb] disabled:cursor-wait disabled:opacity-50"
          >
            {isGenerating ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/25 border-t-ink" aria-hidden="true" />
            ) : isRetry ? (
              <RefreshIcon className="h-4 w-4" />
            ) : null}
            {isGenerating ? `Generating ${meta.label}…` : isRetry ? "Retry generation" : `Generate ${meta.label}`}
          </button>

          {disabled && !isGenerating ? (
            <p className="mt-3 text-xs text-[#9096b0]">Finish the platform currently generating before starting another.</p>
          ) : null}
        </div>
      </div>
    </div>
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

      <div className="mt-4 h-1 w-24 rounded-full bg-[#8bade4]" />
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
  const [isGeneratingAnyway, setIsGeneratingAnyway] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPublishingLinkedIn, setIsPublishingLinkedIn] = useState(false);
  const [linkedInPostUrl, setLinkedInPostUrl] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "selected">("idle");
  const [copyFallbackText, setCopyFallbackText] = useState<string | null>(null);
  const [isSelectingVariant, setIsSelectingVariant] = useState(false);
  const [captionFeedback, setCaptionFeedback] = useState("");
  const [captionFeedbackTarget, setCaptionFeedbackTarget] = useState<CaptionFeedbackTarget | null>(null);
  const [captionFeedbackAnchor, setCaptionFeedbackAnchor] = useState<CommentAnchor | null>(null);
  const [captionFeedbackCommentsByContext, setCaptionFeedbackCommentsByContext] = useState<
    Record<string, CaptionFeedbackComment[]>
  >({});
  const [isCaptionCommentsOpen, setIsCaptionCommentsOpen] = useState(false);
  const [reviewedCaptionCommentId, setReviewedCaptionCommentId] = useState<string | null>(null);
  const [captionVersions, setCaptionVersions] = useState<string[]>(() => [getEditablePostText(platform, content)]);
  const [captionVersionIndex, setCaptionVersionIndex] = useState(0);
  const [isUpdatingCaption, setIsUpdatingCaption] = useState(false);
  const [isNavigatingCaption, setIsNavigatingCaption] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState(() => getSuggestedPostingRecommendation(platform).dateTime);
  const [error, setError] = useState<string | null>(null);
  const scheduleInputRef = useRef<HTMLInputElement | null>(null);
  const editingBaselineRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const commentGenerationIdRef = useRef<string | null>(generationId);

  const displayedContent = ((isEditing || isSaving) && draftContent ? draftContent : content) as PlatformContent;
  const selectedContent =
    platform === "rednote"
      ? withSelectedRedNoteTitle(displayedContent as RedNoteContent, selectedTitleIndex)
      : platform === "threads" && "content" in displayedContent
        ? withSelectedThreadsTopic(displayedContent as ThreadsContent, selectedThreadsTopic)
      : displayedContent;
  const latestSelectedContentRef = useRef(selectedContent);
  latestSelectedContentRef.current = selectedContent;
  const meta = platformMeta[platform];
  const isRecommended = displayedContent.recommended;
  const recommendedReason = getRecommendedReason(platform, displayedContent);
  const postingRecommendation = useMemo(() => getSuggestedPostingRecommendation(platform), [platform]);
  const variants = getContentVariants(content);
  const feedbackContextKey = content.selectedVariantId ?? "single";
  const captionFeedbackComments = captionFeedbackCommentsByContext[feedbackContextKey] ?? [];
  const updateCaptionComments = (
    updater: (comments: CaptionFeedbackComment[]) => CaptionFeedbackComment[],
  ) => {
    setCaptionFeedbackCommentsByContext((commentsByContext) => {
      const nextComments = updater(commentsByContext[feedbackContextKey] ?? []);
      if (!nextComments.length) {
        const nextCommentsByContext = { ...commentsByContext };
        delete nextCommentsByContext[feedbackContextKey];
        return nextCommentsByContext;
      }
      return { ...commentsByContext, [feedbackContextKey]: nextComments };
    });
  };
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
    editingBaselineRef.current = null;
  }, [platform, content]);

  useEffect(() => {
    if (generationId && commentGenerationIdRef.current && generationId !== commentGenerationIdRef.current) {
      setCaptionFeedbackCommentsByContext({});
      setIsCaptionCommentsOpen(false);
      setReviewedCaptionCommentId(null);
    }
    if (generationId) commentGenerationIdRef.current = generationId;
  }, [generationId]);

  useEffect(() => {
    setCaptionFeedback("");
    setCaptionFeedbackTarget(null);
    setCaptionFeedbackAnchor(null);
    setIsCaptionCommentsOpen(false);
    setReviewedCaptionCommentId(null);
    setCaptionVersions([getEditablePostText(platform, content)]);
    setCaptionVersionIndex(0);
    // The context key changes when the user switches platform or variant. Caption saves keep the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackContextKey]);

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
    const nextDraft = cloneContent(selectedContent);
    editingBaselineRef.current = JSON.stringify(nextDraft);
    setDraftContent(nextDraft);
    setIsEditing(true);
    setError(null);
  };

  const saveEditing = async () => {
    if (!draftContent || isSaving) return;

    const pendingContent = cloneContent(draftContent);
    const hasChanges = JSON.stringify(pendingContent) !== editingBaselineRef.current;

    setIsEditing(false);
    editingBaselineRef.current = null;

    if (!hasChanges) {
      setDraftContent(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    const savePromise = onSavePlatform(platform, pendingContent);
    pendingSaveRef.current = savePromise.catch(() => undefined);

    try {
      await savePromise;
      if (platform === "rednote") {
        setSelectedTitleIndex(getSelectedRedNoteTitleIndex(pendingContent as RedNoteContent));
      } else if (platform === "threads") {
        setSelectedThreadsTopic(getSelectedThreadsTopic(pendingContent as ThreadsContent));
      }
      setDraftContent(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not save edits.";
      editingBaselineRef.current = JSON.stringify(content);
      setDraftContent(pendingContent);
      setIsEditing(true);
      setError(message);
    } finally {
      pendingSaveRef.current = null;
      setIsSaving(false);
    }
  };

  const selectRedNoteTitle = (index: number) => {
    if (isSaving) return;
    const next = withSelectedRedNoteTitle(displayedContent as RedNoteContent, index);
    setSelectedTitleIndex(index);
    setDraftContent(next);
    setIsSaving(true);
    setError(null);
    const save = onSavePlatform("rednote", next);
    pendingSaveRef.current = save;
    void save.catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Could not save the title.");
      setSelectedTitleIndex(getSelectedRedNoteTitleIndex(content as RedNoteContent));
    }).finally(() => {
      pendingSaveRef.current = null;
      setIsSaving(false);
    });
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

  const regenerateCaption = async () => {
    const currentText = getEditablePostText(platform, selectedContent);
    if (!generationId) {
      setError("Generate or load a saved post before refining its caption.");
      return;
    }
    const combinedFeedback = formatCaptionFeedbackComments(captionFeedbackComments);

    setIsUpdatingCaption(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          feedback:
            combinedFeedback ||
            "Regenerate this caption as a fresh version while preserving the same narrative, facts, and platform fit.",
          currentText,
        }),
      });
      const data = (await response.json()) as { proposedText?: string; error?: string };
      if (!response.ok || !data.proposedText) {
        throw new Error(data.error ?? "Could not regenerate the caption.");
      }
      const nextContent = withEditablePostText(platform, selectedContent, data.proposedText);
      await onSavePlatform(platform, nextContent);
      const nextVersions = [...captionVersions.slice(0, captionVersionIndex + 1), data.proposedText];
      setCaptionVersions(nextVersions);
      setCaptionVersionIndex(nextVersions.length - 1);
      setIsEditing(false);
      setDraftContent(null);
      setCaptionFeedback("");
      setCaptionFeedbackTarget(null);
      setCaptionFeedbackAnchor(null);
      updateCaptionComments(() => []);
      setIsCaptionCommentsOpen(false);
      setReviewedCaptionCommentId(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not regenerate the caption.");
    } finally {
      setIsUpdatingCaption(false);
    }
  };

  const addCaptionComment = () => {
    if (!captionFeedbackTarget || !captionFeedback.trim()) return;
    updateCaptionComments((comments) => [
      ...comments,
      {
        id: createFeedbackId(),
        target: captionFeedbackTarget,
        feedback: captionFeedback.trim(),
      },
    ]);
    setCaptionFeedback("");
    setCaptionFeedbackTarget(null);
    setCaptionFeedbackAnchor(null);
  };

  const updateCaptionComment = (id: string, feedback: string) => {
    updateCaptionComments((comments) =>
      comments.map((comment) => (comment.id === id ? { ...comment, feedback } : comment)),
    );
  };

  const deleteCaptionComment = (id: string) => {
    if (captionFeedbackComments.length === 1) setIsCaptionCommentsOpen(false);
    if (reviewedCaptionCommentId === id) setReviewedCaptionCommentId(null);
    updateCaptionComments((comments) => comments.filter((comment) => comment.id !== id));
  };

  const showCaptionVersion = async (nextIndex: number) => {
    if (
      nextIndex < 0 ||
      nextIndex >= captionVersions.length ||
      nextIndex === captionVersionIndex ||
      isNavigatingCaption ||
      isUpdatingCaption
    ) {
      return;
    }

    setIsNavigatingCaption(true);
    setError(null);
    try {
      const nextContent = withEditablePostText(platform, selectedContent, captionVersions[nextIndex]);
      await onSavePlatform(platform, nextContent);
      setCaptionVersionIndex(nextIndex);
      setIsEditing(false);
      setDraftContent(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not switch caption versions.");
    } finally {
      setIsNavigatingCaption(false);
    }
  };

  const chooseVariant = async (variantId: string) => {
    if (variantId === content.selectedVariantId || isSelectingVariant) {
      return;
    }

    setIsSelectingVariant(true);
    setError(null);
    try {
      await pendingSaveRef.current;
      const selectionSource = draftContent ? syncSelectedVariant(draftContent) : content;
      await onSavePlatform(platform, selectContentVariant(selectionSource, variantId));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not select this variant.");
    } finally {
      setIsSelectingVariant(false);
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

  const contentActions = (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <ContentFieldAction
        label="←"
        ariaLabel="Previous caption version"
        onClick={() => void showCaptionVersion(captionVersionIndex - 1)}
        disabled={captionVersionIndex === 0 || isNavigatingCaption || isUpdatingCaption}
      />
      <ContentFieldAction
        label="→"
        ariaLabel="Next caption version"
        onClick={() => void showCaptionVersion(captionVersionIndex + 1)}
        disabled={
          captionVersionIndex === captionVersions.length - 1 || isNavigatingCaption || isUpdatingCaption
        }
      />
      <ContentFieldAction
        icon={<CopyIcon className="h-3.5 w-3.5" />}
        label={copyStatus === "copied" ? "Copied" : copyStatus === "selected" ? "Selected" : "Copy"}
        onClick={handleCopy}
      />
      {captionFeedbackComments.length ? (
        <div className="relative">
          <ContentFieldAction
            label={`Comments (${captionFeedbackComments.length})`}
            ariaLabel="Review caption comments"
            onClick={() => {
              setIsCaptionCommentsOpen((isOpen) => !isOpen);
              setReviewedCaptionCommentId(null);
            }}
          />
          {isCaptionCommentsOpen ? (
            <QueuedCommentsPopover
              ariaLabel="Caption comments"
              comments={captionFeedbackComments.map((comment) => ({
                id: comment.id,
                label: comment.target.kind === "selection" ? "Selected text" : "Whole caption",
                feedback: comment.feedback,
                context: comment.target.kind === "selection" ? comment.target.text : undefined,
                canReveal:
                  comment.target.kind === "selection"
                    ? Boolean(resolveTextSelection(getEditablePostText(platform, selectedContent), comment.target))
                    : false,
                revealLabel: "Show in caption →",
                unavailableLabel: "Passage changed",
                revealAriaLabel: "Show selected text",
              }))}
              activeCommentId={reviewedCaptionCommentId}
              onChange={updateCaptionComment}
              onDelete={deleteCaptionComment}
              onReveal={setReviewedCaptionCommentId}
              onClose={() => {
                setIsCaptionCommentsOpen(false);
                setReviewedCaptionCommentId(null);
              }}
            />
          ) : null}
        </div>
      ) : null}
      <ContentFieldAction
        icon={<RefreshIcon className={`h-3.5 w-3.5 ${isUpdatingCaption ? "animate-spin" : ""}`} />}
        label={isUpdatingCaption ? "Regenerating…" : "Regenerate"}
        onClick={() => void regenerateCaption()}
        disabled={isUpdatingCaption || isNavigatingCaption}
      />
      {isSaving ? (
        <span aria-live="polite" className="px-1 text-xs font-semibold text-[#9096b0]">
          Saving…
        </span>
      ) : null}
    </div>
  );

  const captionFeedbackComposer = captionFeedbackTarget && captionFeedbackAnchor ? (
    <CaptionFeedbackComposer
      feedback={captionFeedback}
      target={captionFeedbackTarget}
      anchor={captionFeedbackAnchor}
      onFeedbackChange={setCaptionFeedback}
      onClose={() => {
        setCaptionFeedbackTarget(null);
        setCaptionFeedbackAnchor(null);
        setCaptionFeedback("");
      }}
      onAdd={addCaptionComment}
    />
  ) : null;

  const openOverallCaptionFeedback = (anchor: CommentAnchor) => {
    setCaptionFeedbackTarget({ kind: "overall" });
    setCaptionFeedbackAnchor(anchor);
    setCaptionFeedback("");
    setError(null);
  };
  const reviewedCaptionComment = captionFeedbackComments.find(
    (comment) => comment.id === reviewedCaptionCommentId && comment.target.kind === "selection",
  );
  const highlightedCaptionSelection =
    captionFeedbackTarget?.kind === "selection"
      ? captionFeedbackTarget
      : reviewedCaptionComment?.target.kind === "selection"
        ? resolveTextSelection(getEditablePostText(platform, selectedContent), reviewedCaptionComment.target)
        : null;

  const platformDraftPanel = isRecommended ? (
    platform === "rednote" ? (
      <RedNotePanel
        content={selectedContent as RedNoteContent}
        onBeforeRender={async () => { await pendingSaveRef.current; }}
        isEditing={isEditing}
        selectedTitleIndex={selectedTitleIndex}
        generationId={generationId}
        briefImages={briefImages}
        contentActions={contentActions}
        captionFeedbackComposer={captionFeedbackComposer}
        highlightedCaptionSelection={highlightedCaptionSelection}
        onBeginEdit={isSaving ? undefined : startEditing}
        onCommit={() => void saveEditing()}
        onSelectTitle={selectRedNoteTitle}
        onCommentOverall={openOverallCaptionFeedback}
        onCommentSelection={(selection, anchor) => {
          setCaptionFeedbackTarget({ kind: "selection", ...selection });
          setCaptionFeedbackAnchor(anchor);
          setCaptionFeedback("");
          setError(null);
        }}
        onChange={(next) => (isEditing ? setDraftContent(next) : onPatchPlatform("rednote", next))}
        onSlideRevised={(slideNumber, spec, slideImage) => {
          const base = latestSelectedContentRef.current as RedNoteContent;
          const next = {
            ...base,
            carouselSlides: base.carouselSlides.map((slide) =>
              slide.slideNumber === slideNumber ? { ...slide, spec } : slide,
            ),
            slideImages: [...(base.slideImages ?? []).filter((item) => item.slideNumber !== slideNumber), slideImage]
              .sort((a, b) => a.slideNumber - b.slideNumber),
          };
          latestSelectedContentRef.current = next;
          onPatchPlatform("rednote", next);
        }}
        onRendered={(slideImages, backgrounds) => {
          const base = latestSelectedContentRef.current as RedNoteContent;
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
        contentActions={contentActions}
        captionFeedbackComposer={captionFeedbackComposer}
        highlightedCaptionSelection={highlightedCaptionSelection}
        onBeginEdit={isSaving ? undefined : startEditing}
        onCommit={() => void saveEditing()}
        onSelectThreadsTopic={selectThreadsTopic}
        onCommentOverall={openOverallCaptionFeedback}
        onCommentSelection={(selection, anchor) => {
          setCaptionFeedbackTarget({ kind: "selection", ...selection });
          setCaptionFeedbackAnchor(anchor);
          setCaptionFeedback("");
          setError(null);
        }}
        onChange={setDraftContent}
      />
    )
  ) : (
    <div className="rounded-md border border-dashed border-line bg-canvas px-3 py-4 text-sm leading-6 text-muted">
      No draft was generated for this platform because it is not recommended for this brief. Use Generate anyway to
      create a post for this platform.
    </div>
  );

  const linkedInImagePanel =
    isRecommended && platform === "linkedin" && "content" in displayedContent ? (
      <LinkedInImageSection
        content={content as TextPlatformContent}
        postText={(displayedContent as TextPlatformContent).content}
        generationId={generationId}
        briefImages={briefImages}
        onImageChange={(image) => onPatchPlatform("linkedin", { ...(content as TextPlatformContent), image })}
      />
    ) : null;

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

        {isRecommended && variants.length > 1 ? (
          <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <VariantRail
              content={content}
              isSaving={isSelectingVariant || isSaving}
              onChoose={(variantId) => void chooseVariant(variantId)}
            />
            <section className="min-w-0 rounded-xl border border-line bg-white p-5 shadow-[0_8px_26px_rgba(67,75,99,0.07)]">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9096b0]">Full draft</p>
                  <h2 className="mt-1 text-base font-bold text-ink">
                    {variants.find((variant) => variant.id === content.selectedVariantId)?.label ?? "Working draft"}
                  </h2>
                </div>
                <span className="rounded-full bg-[#d3eafa]/65 px-2.5 py-1 text-xs font-semibold text-[#536a91]">
                  Editing this version
                </span>
              </div>
              {platformDraftPanel}
              {linkedInImagePanel}
            </section>
          </div>
        ) : (
          <>
            {platformDraftPanel}
            {linkedInImagePanel}
          </>
        )}

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
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-lg border-t border-line bg-white/95 px-6 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
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

function VariantRail({
  content,
  isSaving,
  onChoose,
}: {
  content: PlatformContent;
  isSaving: boolean;
  onChoose: (variantId: string) => void;
}) {
  const variants = getContentVariants(content);
  const recommendedVariantId = content.recommendedVariantId ?? variants[0]?.id;
  const selectedVariantId = content.selectedVariantId ?? recommendedVariantId;

  return (
    <aside className="rounded-xl border border-[#8bade4]/30 bg-[#f7faff] p-3 lg:sticky lg:top-20">
      <div className="px-1 pb-2.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6f89b4]">Variants</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
        {variants.map((variant, index) => {
          const isSelected = variant.id === selectedVariantId;
          const isRecommended = variant.id === recommendedVariantId;
          return (
            <button
              key={variant.id}
              type="button"
              aria-pressed={isSelected}
              disabled={isSaving}
              onClick={() => onChoose(variant.id)}
              className={`group rounded-lg border p-3 text-left transition disabled:cursor-wait disabled:opacity-70 ${
                isSelected
                  ? "border-[#8bade4] bg-white shadow-[0_5px_16px_rgba(83,106,145,0.12)] ring-2 ring-[#8bade4]/15"
                  : "border-line bg-white/80 hover:border-[#8bade4]/65 hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9096b0]">
                  Variant {String.fromCharCode(65 + index)}
                </span>
                {isSelected ? <span className="text-xs font-bold text-[#6f89b4]">✓</span> : null}
              </div>
              <p className="mt-1.5 text-sm font-bold leading-5 text-ink">{variant.label}</p>
              {isRecommended ? (
                <span className="mt-2 inline-flex rounded-full bg-[#d3eafa] px-2 py-0.5 text-[10px] font-bold text-[#536a91]">
                  Crosscast recommends
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function RedNotePanel({
  content,
  onBeforeRender,
  isEditing,
  selectedTitleIndex,
  generationId,
  briefImages,
  contentActions,
  captionFeedbackComposer,
  highlightedCaptionSelection,
  onBeginEdit,
  onCommit,
  onSelectTitle,
  onCommentOverall,
  onCommentSelection,
  onChange,
  onSlideRevised,
  onRendered,
}: {
  content: RedNoteContent;
  onBeforeRender: () => Promise<void>;
  isEditing: boolean;
  selectedTitleIndex: number;
  generationId: string | null;
  briefImages: BriefState["images"];
  contentActions: React.ReactNode;
  captionFeedbackComposer: React.ReactNode;
  highlightedCaptionSelection: TextSelection | null;
  onBeginEdit?: () => void;
  onCommit: () => void;
  onSelectTitle: (index: number) => void;
  onCommentOverall: (anchor: CommentAnchor) => void;
  onCommentSelection: (selection: TextSelection, anchor: CommentAnchor) => void;
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
        isEditing={false}
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
          <p className="text-xl font-bold leading-7 text-ink">{titleOptions[selectedIndex] ?? ""}</p>
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
          isEditing={false}
          onChange={updateSelectedTitle}
        />
      )}
      <EditableBlock
        label="Caption"
        value={content.caption}
        rows={7}
        isEditing={isEditing}
        actions={contentActions}
        highlightSelection={highlightedCaptionSelection}
        onBeginEdit={onBeginEdit}
        onBlur={onCommit}
        onCommentOverall={onCommentOverall}
        onCommentSelection={onCommentSelection}
        autoFocus
        onChange={(value) => onChange({ ...content, caption: value })}
      />
      {captionFeedbackComposer}

      <CarouselSection
        content={content}
        onBeforeRender={onBeforeRender}
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
  onBeforeRender,
  generationId,
  briefImages,
  onChange,
  onRendered,
  onSlideRevised,
}: {
  content: RedNoteContent;
  onBeforeRender: () => Promise<void>;
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
      await onBeforeRender();
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
      setError(getFriendlyImageError(message));
    } finally {
      setIsBusy(false);
    }
  };

  const applyComment = async () => {
    if (!generationId || selectedSlide === null || !activeSlide?.spec || !comment.trim()) return;

    setIsBusy(true);
    setError(null);
    try {
      await onBeforeRender();
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
          selectedTitle: getSelectedRedNoteTitle(content),
          isCover: selectedSlide === content.carouselSlides[0]?.slideNumber,
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
      setError(getFriendlyImageError(message));
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
              label={isBusy ? "Applying feedback…" : "Apply feedback + regenerate"}
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
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
          {error} Your feedback is still here so you can retry.
        </p>
      ) : null}
    </div>
  );
}

function TextPlatformPanel({
  content,
  isEditing,
  platform,
  selectedThreadsTopic,
  contentActions,
  captionFeedbackComposer,
  highlightedCaptionSelection,
  onBeginEdit,
  onCommit,
  onSelectThreadsTopic,
  onCommentOverall,
  onCommentSelection,
  onChange,
}: {
  content: TextPlatformContent;
  isEditing: boolean;
  platform: PlatformKey;
  selectedThreadsTopic: string;
  contentActions: React.ReactNode;
  captionFeedbackComposer: React.ReactNode;
  highlightedCaptionSelection: TextSelection | null;
  onBeginEdit?: () => void;
  onCommit: () => void;
  onSelectThreadsTopic: (topic: string) => void;
  onCommentOverall: (anchor: CommentAnchor) => void;
  onCommentSelection: (selection: TextSelection, anchor: CommentAnchor) => void;
  onChange: (content: TextPlatformContent) => void;
}) {
  const displayedAngle = cleanInternalWorkflowPhrases(content.angle);

  return (
    <div className="space-y-5">
      <EditableBlock
        label="Angle"
        value={displayedAngle}
        rows={2}
        isEditing={false}
        onChange={(value) => onChange({ ...content, angle: cleanInternalWorkflowPhrases(value) })}
      />
      {platform === "threads" ? (
        <ThreadsTopicSection
          content={content as ThreadsContent}
          isEditing={false}
          selectedTopic={selectedThreadsTopic}
          onSelectTopic={onSelectThreadsTopic}
          onChange={(nextContent) => onChange(nextContent)}
        />
      ) : null}
      <EditableBlock
        label="Post Text"
        value={content.content}
        rows={9}
        isEditing={isEditing}
        actions={contentActions}
        highlightSelection={highlightedCaptionSelection}
        onBeginEdit={onBeginEdit}
        onBlur={onCommit}
        onCommentOverall={onCommentOverall}
        onCommentSelection={onCommentSelection}
        autoFocus
        onChange={(value) => onChange({ ...content, content: value })}
      />
      {captionFeedbackComposer}
    </div>
  );
}

function CaptionFeedbackComposer({
  feedback,
  target,
  anchor,
  onFeedbackChange,
  onClose,
  onAdd,
}: {
  feedback: string;
  target: CaptionFeedbackTarget;
  anchor: CommentAnchor;
  onFeedbackChange: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <section
      role="dialog"
      aria-label={target.kind === "selection" ? "Selected text feedback" : "Caption feedback comment"}
      style={{ left: anchor.x, top: anchor.y }}
      className="fixed z-50 max-h-[calc(100vh-1.5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-[#8bade4]/45 bg-white p-3.5 shadow-[0_18px_48px_rgba(38,50,77,0.22)]"
    >
      <p className="pr-9 text-sm font-bold text-ink">What do you want to change?</p>
      <button
        type="button"
        aria-label="Close caption feedback"
        onClick={onClose}
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-[#f7faff] hover:text-ink"
      >
        <XIcon className="h-4 w-4" />
      </button>

      <div className="mt-3 space-y-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Caption feedback</span>
          <textarea
            value={feedback}
            onChange={(event) => onFeedbackChange(event.target.value)}
            autoFocus
            rows={3}
            placeholder="Add feedback…"
            className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm leading-5 text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
          />
        </label>
        <div className="flex justify-end">
          <ActionButton
            label="Add comment"
            onClick={onAdd}
            disabled={!feedback.trim()}
            strong
          />
        </div>
      </div>
    </section>
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
  const [instructions, setInstructions] = useState("");
  const [feedbackTarget, setFeedbackTarget] = useState<ImageFeedbackTarget | null>(null);
  const [feedbackAnchor, setFeedbackAnchor] = useState<CommentAnchor | null>(null);
  const [feedbackComments, setFeedbackComments] = useState<ImageFeedbackComment[]>([]);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [reviewedImageCommentId, setReviewedImageCommentId] = useState<string | null>(null);
  const [draftRegion, setDraftRegion] = useState<ImageFeedbackRegion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressContextMenuRef = useRef(false);

  useEffect(() => {
    setInstructions("");
    setFeedbackTarget(null);
    setFeedbackAnchor(null);
    setFeedbackComments([]);
    setIsCommentsOpen(false);
    setReviewedImageCommentId(null);
    setDraftRegion(null);
  }, [image?.url]);

  const getImagePoint = (clientX: number, clientY: number) => {
    const rect = imageFrameRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const getRegion = (start: { x: number; y: number }, end: { x: number; y: number }): ImageFeedbackRegion => ({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  });

  const openOverallFeedback = (anchor: CommentAnchor) => {
    setFeedbackTarget({ kind: "overall" });
    setFeedbackAnchor(anchor);
    setDraftRegion(null);
    setInstructions("");
    setError(null);
  };

  const describeTarget = (target: ImageFeedbackTarget, feedback: string) => {
    if (target.kind !== "region") return `Overall image comment: ${feedback}`;
    const { x, y, width, height } = target.region;
    return [
      "Use current_generated_image as the visual baseline. Apply the following feedback specifically to this region while preserving the rest of the composition as closely as possible.",
      `Region coordinates measured from the top-left: x ${Math.round(x * 100)}%, y ${Math.round(y * 100)}%, width ${Math.round(width * 100)}%, height ${Math.round(height * 100)}%.`,
      feedback,
    ].join(" ");
  };

  const addImageComment = () => {
    if (!feedbackTarget || !instructions.trim()) return;
    setFeedbackComments((comments) => [
      ...comments,
      { id: createFeedbackId(), target: feedbackTarget, feedback: instructions.trim() },
    ]);
    setFeedbackTarget(null);
    setFeedbackAnchor(null);
    setDraftRegion(null);
    setInstructions("");
  };

  const updateImageComment = (id: string, feedback: string) => {
    setFeedbackComments((comments) =>
      comments.map((comment) => (comment.id === id ? { ...comment, feedback } : comment)),
    );
  };

  const deleteImageComment = (id: string) => {
    if (reviewedImageCommentId === id) setReviewedImageCommentId(null);
    setFeedbackComments((comments) => {
      const nextComments = comments.filter((comment) => comment.id !== id);
      if (!nextComments.length) setIsCommentsOpen(false);
      return nextComments;
    });
  };

  const generate = async () => {
    if (!generationId) {
      setError("Generate or load a saved LinkedIn post before generating an image.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const combinedInstructions = feedbackComments
        .map((comment) => describeTarget(comment.target, comment.feedback))
        .join("\n");
      const response = await fetch("/api/linkedin/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId,
          postText,
          images: briefImages,
          currentImageUrl: image?.url,
          instructions: combinedInstructions || undefined,
        }),
      });
      const data = (await response.json()) as { image?: PostImage; error?: string };

      if (!response.ok || !data.image) {
        throw new Error(data.error ?? "Could not generate the LinkedIn image.");
      }

      onImageChange(data.image);
      setFeedbackTarget(null);
      setFeedbackAnchor(null);
      setFeedbackComments([]);
      setIsCommentsOpen(false);
      setReviewedImageCommentId(null);
      setDraftRegion(null);
      setInstructions("");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not generate the LinkedIn image.";
      setError(getFriendlyImageError(message));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mt-5 rounded-md border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Post Image</p>
        <div className="flex items-center gap-2">
          {feedbackComments.length ? (
            <div className="relative">
              <ActionButton
                label={`Comments (${feedbackComments.length})`}
                onClick={() => {
                  setIsCommentsOpen((isOpen) => !isOpen);
                  setReviewedImageCommentId(null);
                }}
              />
              {isCommentsOpen ? (
                <QueuedCommentsPopover
                  ariaLabel="Image comments"
                  comments={feedbackComments.map((comment, index) => {
                    const regionNumber = feedbackComments
                      .slice(0, index + 1)
                      .filter((queuedComment) => queuedComment.target.kind === "region").length;
                    return {
                      id: comment.id,
                      label: comment.target.kind === "region" ? `Marked area ${regionNumber}` : "Whole image",
                      feedback: comment.feedback,
                      canReveal: comment.target.kind === "region",
                      revealLabel: comment.target.kind === "region" ? "Show on image →" : undefined,
                      revealAriaLabel:
                        comment.target.kind === "region" ? `Show marked area ${regionNumber}` : undefined,
                    };
                  })}
                  activeCommentId={reviewedImageCommentId}
                  onChange={updateImageComment}
                  onDelete={deleteImageComment}
                  onReveal={setReviewedImageCommentId}
                  onClose={() => {
                    setIsCommentsOpen(false);
                    setReviewedImageCommentId(null);
                  }}
                />
              ) : null}
            </div>
          ) : null}
          <ActionButton
            icon={<RefreshIcon className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />}
            label={isGenerating ? (image ? "Regenerating…" : "Generating…") : image ? "Regenerate" : "Generate image"}
            onClick={generate}
            disabled={isGenerating}
            strong={!image}
          />
        </div>
      </div>

      {image ? (
        <div
          ref={imageFrameRef}
          onPointerDown={(event) => {
            if (event.button !== 2) return;
            const point = getImagePoint(event.clientX, event.clientY);
            if (!point) return;
            setFeedbackTarget(null);
            setFeedbackAnchor(null);
            setInstructions("");
            dragStartRef.current = point;
            setDraftRegion({ ...point, width: 0, height: 0 });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragStartRef.current || (event.buttons & 2) === 0) return;
            const point = getImagePoint(event.clientX, event.clientY);
            if (!point) return;
            setDraftRegion(getRegion(dragStartRef.current, point));
          }}
          onPointerUp={(event) => {
            if (event.button !== 2 || !dragStartRef.current) return;
            const point = getImagePoint(event.clientX, event.clientY);
            const region = point ? getRegion(dragStartRef.current, point) : null;
            dragStartRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (region && region.width >= 0.02 && region.height >= 0.02) {
              suppressContextMenuRef.current = true;
              setDraftRegion(region);
              setFeedbackTarget({ kind: "region", region });
              setFeedbackAnchor(getCommentBubbleAnchor(event.clientX, event.clientY));
              setInstructions("");
              setError(null);
            } else {
              setDraftRegion(null);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            if (suppressContextMenuRef.current) {
              suppressContextMenuRef.current = false;
              return;
            }
            openOverallFeedback(getCommentBubbleAnchor(event.clientX, event.clientY));
          }}
          className="relative mt-3 overflow-hidden rounded-md border border-line bg-white select-none"
        >
          <img
            src={image.url}
            alt="Generated LinkedIn post image"
            draggable={false}
            className="pointer-events-none w-full object-contain"
          />
          {draftRegion ? (
            <span
              aria-label="Selected image feedback area"
              className="pointer-events-none absolute border-2 border-[#5f8fe0] bg-[#8bade4]/20 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
              style={{
                left: `${draftRegion.x * 100}%`,
                top: `${draftRegion.y * 100}%`,
                width: `${draftRegion.width * 100}%`,
                height: `${draftRegion.height * 100}%`,
              }}
            />
          ) : null}
          {feedbackComments.map((comment, index) => {
            if (comment.target.kind !== "region") return null;
            const regionNumber = feedbackComments
              .slice(0, index + 1)
              .filter((queuedComment) => queuedComment.target.kind === "region").length;
            const isActive = reviewedImageCommentId === comment.id;
            return (
              <span
                key={comment.id}
                aria-label={`Marked image feedback area ${regionNumber}`}
                className={`pointer-events-none absolute shadow-[0_0_0_1px_rgba(255,255,255,0.9)] transition ${
                  isActive
                    ? "border-[3px] border-[#4f7fd1] bg-[#8bade4]/30 ring-4 ring-[#8bade4]/20"
                    : "border-2 border-[#5f8fe0] bg-[#8bade4]/20"
                }`}
                style={{
                  left: `${comment.target.region.x * 100}%`,
                  top: `${comment.target.region.y * 100}%`,
                  width: `${comment.target.region.width * 100}%`,
                  height: `${comment.target.region.height * 100}%`,
                }}
              >
                <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#5f8fe0] text-[10px] font-bold text-white shadow-sm">
                  {regionNumber}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-line bg-white px-3 py-4 text-sm leading-6 text-muted">
          No image yet. Generate composes one LinkedIn-ready image from the post text and your uploaded raw materials.
        </p>
      )}

      {image && feedbackTarget && feedbackAnchor ? (
        <section
          role="dialog"
          aria-label={feedbackTarget.kind === "region" ? "Selected image area feedback" : "Image feedback comment"}
          style={{ left: feedbackAnchor.x, top: feedbackAnchor.y }}
          className="fixed z-50 max-h-[calc(100vh-1.5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-[#8bade4]/45 bg-white p-3.5 shadow-[0_18px_48px_rgba(38,50,77,0.22)]"
        >
          <p className="pr-9 text-sm font-bold text-ink">What do you want to change?</p>
          <button
            type="button"
            aria-label="Close image feedback"
            onClick={() => {
              setFeedbackTarget(null);
              setFeedbackAnchor(null);
              setDraftRegion(null);
              setInstructions("");
            }}
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-[#f7faff] hover:text-ink"
          >
            <XIcon className="h-4 w-4" />
          </button>
          <div className="mt-3 space-y-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Image feedback</span>
              <textarea
                autoFocus
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={2}
                placeholder="Add feedback…"
                className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm leading-5 text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
              />
            </label>
            <div className="flex justify-end">
              <ActionButton
                label="Add comment"
                onClick={addImageComment}
                disabled={!instructions.trim()}
                strong
              />
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
          {error} Your feedback is still here so you can retry.
        </p>
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
  actions,
  highlightSelection,
  onBeginEdit,
  onBlur,
  onCommentOverall,
  onCommentSelection,
  autoFocus = false,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  isEditing: boolean;
  actions?: React.ReactNode;
  highlightSelection?: TextSelection | null;
  onBeginEdit?: () => void;
  onBlur?: () => void;
  onCommentOverall?: (anchor: CommentAnchor) => void;
  onCommentSelection?: (selection: TextSelection, anchor: CommentAnchor) => void;
  autoFocus?: boolean;
  onChange?: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const minimumHeight = rows * 24 + 18;

  const captureSelection = (textarea: HTMLTextAreaElement) => {
    if (!onCommentSelection || textarea.selectionStart === textarea.selectionEnd) {
      return null;
    }

    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      text: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
    };
    if (!selection.text.trim()) {
      return null;
    }

    return selection;
  };

  return (
    <div className="block">
      <span className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {actions}
      </span>
      <div className="grid w-full" style={{ minHeight: minimumHeight }}>
        <div
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 whitespace-pre-wrap rounded-md border border-transparent px-3 py-2 text-sm leading-6"
        >
          {value || "\u200b"}
        </div>
        {highlightSelection ? (
          <div
            aria-label={`${label} with selected text highlighted`}
            className="col-start-1 row-start-1 h-full w-full whitespace-pre-wrap rounded-md border border-[#8bade4]/55 bg-white px-3 py-2 text-left text-sm leading-6 text-ink ring-4 ring-[#8bade4]/10"
          >
            {value.slice(0, highlightSelection.start)}
            <mark className="rounded-sm bg-[#d3eafa] px-0.5 text-ink">
              {value.slice(highlightSelection.start, highlightSelection.end)}
            </mark>
            {value.slice(highlightSelection.end)}
          </div>
        ) : isEditing ? (
          <textarea
            ref={textareaRef}
            autoFocus={autoFocus}
            aria-label={label || undefined}
            value={value}
            onChange={(event) => onChange?.(event.currentTarget.value)}
            onContextMenu={(event) => {
              if (!onCommentOverall && !onCommentSelection) return;
              event.preventDefault();
              const selection = captureSelection(event.currentTarget);
              const anchor = getCommentBubbleAnchor(event.clientX, event.clientY);
              if (selection) {
                onCommentSelection?.(selection, anchor);
              } else {
                onCommentOverall?.(anchor);
              }
            }}
            onBlur={onBlur}
            rows={rows}
            className="col-start-1 row-start-1 h-full min-h-full w-full resize-none overflow-hidden rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
          />
        ) : onBeginEdit ? (
          <button
            type="button"
            onClick={onBeginEdit}
            onContextMenu={(event) => {
              if (!onCommentOverall) return;
              event.preventDefault();
              onCommentOverall(getCommentBubbleAnchor(event.clientX, event.clientY));
            }}
            aria-label={`Edit ${label.toLowerCase()}`}
            title={onCommentOverall ? "Right-click to comment on the whole caption" : undefined}
            className="col-start-1 row-start-1 h-full w-full cursor-text whitespace-pre-wrap rounded-md border border-line bg-white px-3 py-2 text-left text-sm leading-6 text-ink transition hover:border-[#8bade4]/65 hover:bg-[#fefdf8]"
          >
            {value}
          </button>
        ) : (
          <div className="col-start-1 row-start-1 h-full w-full whitespace-pre-wrap rounded-md border border-line bg-white px-3 py-2 text-left text-sm leading-6 text-ink">
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

function getCommentBubbleAnchor(clientX: number, clientY: number): CommentAnchor {
  const gap = 12;
  const viewportPadding = 12;
  const bubbleWidth = Math.min(352, window.innerWidth - viewportPadding * 2);
  const estimatedBubbleHeight = Math.min(360, window.innerHeight - viewportPadding * 2);

  return {
    x: Math.max(viewportPadding, Math.min(clientX + gap, window.innerWidth - bubbleWidth - viewportPadding)),
    y: Math.max(viewportPadding, Math.min(clientY + gap, window.innerHeight - estimatedBubbleHeight - viewportPadding)),
  };
}

function createFeedbackId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatCaptionFeedbackComments(comments: CaptionFeedbackComment[]) {
  return comments
    .map((comment, index) =>
      comment.target.kind === "selection"
        ? `Targeted comment ${index + 1} for the passage “${comment.target.text}”: ${comment.feedback}`
        : `Overall comment ${index + 1}: ${comment.feedback}`,
    )
    .join("\n");
}

function resolveTextSelection(value: string, selection: TextSelection): TextSelection | null {
  if (value.slice(selection.start, selection.end) === selection.text) return selection;
  const start = value.indexOf(selection.text);
  return start >= 0 ? { ...selection, start, end: start + selection.text.length } : null;
}

function QueuedCommentsPopover({
  ariaLabel,
  comments,
  activeCommentId,
  onChange,
  onDelete,
  onReveal,
  onClose,
}: {
  ariaLabel: string;
  comments: Array<{
    id: string;
    label: string;
    feedback: string;
    context?: string;
    canReveal?: boolean;
    revealLabel?: string;
    unavailableLabel?: string;
    revealAriaLabel?: string;
  }>;
  activeCommentId?: string | null;
  onChange: (id: string, feedback: string) => void;
  onDelete: (id: string) => void;
  onReveal?: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <section
      role="dialog"
      aria-label={ariaLabel}
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[#8bade4]/40 bg-white p-3 shadow-[0_18px_48px_rgba(38,50,77,0.2)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-ink">Comments</p>
        <button
          type="button"
          aria-label={`Close ${ariaLabel.toLowerCase()}`}
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-[#f7faff] hover:text-ink"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-0.5">
        {comments.map((comment, index) => (
          <div
            key={comment.id}
            className={`rounded-lg border p-2.5 transition ${
              activeCommentId === comment.id
                ? "border-[#8bade4] bg-[#f7faff] ring-2 ring-[#8bade4]/15"
                : "border-line bg-[#fefdf8]"
            }`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7a87a5]">
                {comment.label}
              </span>
              <button
                type="button"
                aria-label={`Delete comment ${index + 1}`}
                onClick={() => onDelete(comment.id)}
                className="grid h-6 w-6 place-items-center rounded-full text-muted transition hover:bg-rose-50 hover:text-rose-600"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {comment.context || comment.revealLabel ? (
              <button
                type="button"
                aria-label={`${comment.revealAriaLabel ?? "Show comment target"} for comment ${index + 1}`}
                onClick={() => onReveal?.(comment.id)}
                disabled={!comment.canReveal}
                className="mb-2 block w-full rounded-md bg-[#edf5ff] px-2.5 py-2 text-left transition hover:bg-[#dfeeff] disabled:cursor-default disabled:opacity-65"
              >
                {comment.context ? (
                  <span className="block max-h-10 overflow-hidden text-xs leading-5 text-[#536a91]">
                    “{comment.context}”
                  </span>
                ) : null}
                <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f89b4]">
                  {comment.canReveal
                    ? (comment.revealLabel ?? "Show target →")
                    : (comment.unavailableLabel ?? "Target changed")}
                </span>
              </button>
            ) : null}
            <label>
              <span className="sr-only">Edit comment {index + 1}</span>
              <textarea
                aria-label={`Edit comment ${index + 1}`}
                value={comment.feedback}
                onChange={(event) => onChange(comment.id, event.target.value)}
                rows={2}
                className="w-full resize-none rounded-md border border-line bg-white px-2.5 py-2 text-sm leading-5 text-ink outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10"
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContentFieldAction({
  icon,
  label,
  ariaLabel,
  onClick,
  strong = false,
  disabled = false,
}: {
  icon?: React.ReactNode;
  label: string;
  ariaLabel?: string;
  onClick: () => void;
  strong?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${
        strong
          ? "bg-[#8bade4] text-ink hover:bg-[#7a9edb]"
          : "border border-line bg-white text-[#536a91] hover:border-[#8bade4]/65 hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
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
          ? "bg-[#8bade4] text-ink shadow-brand hover:bg-[#7a9edb] disabled:cursor-not-allowed disabled:opacity-60"
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
    carouselSlides: content.carouselSlides.map((slide, index) =>
      index === 0 && slide.spec && titleOptions.length
        ? { ...slide, spec: { ...slide.spec, text: { ...slide.spec.text, title: titleOptions[normalizeTitleIndex(selectedTitleIndex, titleOptions)] } } }
        : slide,
    ),
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

function getEditablePostText(platform: PlatformKey, content: PlatformContent) {
  if (platform === "rednote" && "caption" in content) return content.caption;
  return "content" in content ? content.content : "";
}

function withEditablePostText(platform: PlatformKey, content: PlatformContent, value: string): PlatformContent {
  if (platform === "rednote" && "caption" in content) {
    return { ...content, caption: value };
  }
  if ("content" in content) {
    return { ...content, content: value };
  }
  return content;
}

function getFriendlyImageError(message: string) {
  if (/insufficient credits|settings\/credits|\(402\)/i.test(message)) {
    return "Image generation credits have run out. Add OpenRouter credits, then retry.";
  }
  if (/OPENROUTER_API_KEY is not configured/i.test(message)) {
    return "Image generation is not configured yet. Add an OpenRouter API key, then retry.";
  }
  return message;
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

function platformLifecycleLabel(state: PlatformGenerationState, status: PlatformStatus) {
  if (state === "not_generated") return "Not generated";
  if (state === "generating") return "Generating";
  if (state === "error") return "Needs retry";
  return statusLabel(status);
}

function platformLifecycleClass(state: PlatformGenerationState, status: PlatformStatus) {
  if (state === "generating") return "bg-[#d3eafa] text-[#536a91]";
  if (state === "error") return "bg-rose-50 text-rose-700";
  if (state === "not_generated") return "bg-canvas text-muted";
  if (status === "posted") return "bg-teal/10 text-teal";
  if (status === "approved") return "bg-violet/10 text-violet";
  return "bg-canvas text-muted";
}
