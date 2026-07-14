"use client";

import { useEffect, useState } from "react";
import { AssistantPanel } from "./assistant-panel";
import { CalendarView, DashboardView } from "./calendar-dashboard";
import { copyToClipboard } from "./clipboard";
import { CreateView } from "./create-view";
import { EditorView } from "./editor-view";
import { CalendarIcon, CreateIcon, DashboardIcon, PanelIcon, PlusIcon, SearchIcon } from "./icons";
import { defaultBrief, fallbackScheduledPosts, fallbackSessions, initialStatuses, sampleGeneration } from "./mock-data";
import type {
  BriefState,
  GeneratedContent,
  PlatformKey,
  PlatformStatus,
  RedNoteContent,
  ScheduledPost,
  SessionDetail,
  SessionSummary,
  TextPlatformContent,
  ViewKey,
} from "./types";

export function CrosscastApp() {
  const [view, setView] = useState<ViewKey>("create");
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [lastCreateView, setLastCreateView] = useState<Extract<ViewKey, "create" | "editor">>("create");
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [brief, setBrief] = useState<BriefState>(defaultBrief);
  const [sessions, setSessions] = useState<SessionSummary[]>(fallbackSessions);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<PlatformKey, PlatformStatus>>(initialStatuses);
  const [generation, setGeneration] = useState<GeneratedContent>(sampleGeneration);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>(fallbackScheduledPosts);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dbNotice, setDbNotice] = useState<string | null>(null);

  useEffect(() => {
    if (view === "create" || view === "editor") {
      setLastCreateView(view);
    }
  }, [view]);

  useEffect(() => {
    let isMounted = true;

    async function loadSessions() {
      try {
        const response = await fetch("/api/sessions");
        const data = (await response.json()) as { sessions?: SessionSummary[]; error?: string };

        if (!isMounted) return;

        if (!response.ok || !data.sessions) {
          throw new Error(data.error ?? "Could not load sessions.");
        }

        setSessions(data.sessions);
        mergeLocalHistory(data.sessions);
        setDbNotice(data.error ?? null);
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Could not load sessions.";
        setDbNotice(message);
        setSessions(getLocalSessionSummaries());
        return;
      }
    }

    loadSessions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const publishDueLinkedInPosts = async () => {
      try {
        const response = await fetch("/api/linkedin/publish-due", {
          method: "POST",
        });
        const data = (await response.json()) as {
          results?: Array<{ scheduledPostId?: string; generationId?: string; postUrl?: string; status?: string; error?: string }>;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Could not publish due LinkedIn posts.");
        }

        const postedResults = (data.results ?? []).filter((item) => item.status === "posted" && item.scheduledPostId);
        if (!isMounted || !postedResults.length) return;

        setScheduledPosts((items) =>
          items.map((item) =>
            postedResults.some((result) => result.scheduledPostId === item.id) ? { ...item, status: "posted" } : item,
          ),
        );
        let postedCurrentLinkedIn = false;
        setGeneration((current) => {
          postedCurrentLinkedIn = postedResults.some((result) => result.generationId === current.generationIds?.linkedin);
          if (!postedCurrentLinkedIn) return current;

          return {
            ...current,
            platformStatuses: {
              ...current.platformStatuses,
              linkedin: "posted",
            },
          };
        });
        if (postedCurrentLinkedIn) {
          setStatuses((next) => ({
            ...next,
            linkedin: "posted",
          }));
        }
      } catch (caughtError) {
        console.error("[LinkedIn] Due publish check failed", caughtError);
      }
    };

    void publishDueLinkedInPosts();
    const intervalId = window.setInterval(publishDueLinkedInPosts, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadScheduledPosts() {
      try {
        const response = await fetch("/api/scheduled-posts");
        const data = (await response.json()) as { scheduledPosts?: ScheduledPost[]; error?: string };

        if (!isMounted) return;

        if (!response.ok || !data.scheduledPosts) {
          throw new Error(data.error ?? "Could not load scheduled posts.");
        }

        setScheduledPosts(data.scheduledPosts);
      } catch {
        if (!isMounted) return;
        setScheduledPosts(fallbackScheduledPosts);
      }
    }

    loadScheduledPosts();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setDbNotice(null);

    const localId = currentSessionId ?? crypto.randomUUID();
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: localId,
          theme: brief.theme,
          rawMaterial: brief.rawMaterial,
          additionalContext: brief.additionalContext,
          images: brief.images.map((image) => ({
            id: image.id,
            name: image.name,
            url: image.url,
          })),
        }),
      });

      const data = (await response.json()) as {
        sessionId?: string;
        generation?: GeneratedContent;
        error?: string;
      };

      if (!response.ok || !data.generation || !data.sessionId) {
        throw new Error(data.error ?? "Generation failed.");
      }

      const nextSession: SessionSummary = {
        id: data.sessionId,
        date: formatDate(new Date().toISOString()),
        title: brief.theme || "Untitled brief",
        brief,
      };
      setCurrentSessionId(data.sessionId);
      setSessions((items) => [nextSession, ...items.filter((item) => item.id !== data.sessionId)]);
      setGeneration(data.generation);
      setStatuses(buildStatuses(data.generation));
      saveLocalSession({
        ...nextSession,
        generation: data.generation,
      });
      setView("editor");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      setDbNotice(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNewSession = async () => {
    if (currentSessionId && (brief.theme || brief.rawMaterial || brief.additionalContext || brief.images.length > 0)) {
      const currentSummary: SessionSummary = {
        id: currentSessionId,
        date: formatDate(new Date().toISOString()),
        title: brief.theme || "Untitled brief",
        brief,
      };
      saveLocalSession({
        ...currentSummary,
        generation: view === "editor" ? generation : null,
      });
      setSessions((items) => [currentSummary, ...items.filter((item) => item.id !== currentSessionId)]);
    }

    setBrief(defaultBrief);
    setIsAssistantOpen(false);
    setView("create");
    setGeneration(sampleGeneration);
    setStatuses(initialStatuses);
    setDbNotice(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
      });
      const data = (await response.json()) as { session?: SessionSummary; error?: string };

      if (!response.ok || !data.session) {
        throw new Error(data.error ?? "Could not create a new session.");
      }

      setCurrentSessionId(data.session.id);
      setSessions((items) => [data.session!, ...items.filter((item) => item.id !== data.session!.id)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create a new session.";
      setCurrentSessionId(null);
      setDbNotice(message);
    }
  };

  const handleLoadSession = async (session: SessionSummary) => {
    setDbNotice(null);
    try {
      const response = await fetch(`/api/sessions/${session.id}`);
      const data = (await response.json()) as { session?: SessionDetail; error?: string };

      if (!response.ok || !data.session) {
        throw new Error(data.error ?? "Could not load session.");
      }

      setBrief(data.session.brief);
      setCurrentSessionId(data.session.id);
      saveLocalSession(data.session);

      if (data.session.generation) {
        setGeneration(data.session.generation);
        setStatuses(buildStatuses(data.session.generation));
        setView("editor");
      } else {
        setGeneration(sampleGeneration);
        setStatuses(initialStatuses);
        setView("create");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load session.";
      const cachedSession = getLocalSessionDetail(session.id);

      if (cachedSession) {
        setBrief(cachedSession.brief);
        setCurrentSessionId(cachedSession.id);
        setGeneration(cachedSession.generation ?? sampleGeneration);
        setStatuses(cachedSession.generation ? buildStatuses(cachedSession.generation) : initialStatuses);
        setView(cachedSession.generation ? "editor" : "create");
        setDbNotice(message);
        return;
      }

      const hasFallbackGeneration = session.id === "may-27-claude";
      setBrief(session.brief);
      setCurrentSessionId(session.id.startsWith("may-") ? null : session.id);
      setGeneration(sampleGeneration);
      setStatuses(hasFallbackGeneration ? buildStatuses(sampleGeneration) : initialStatuses);
      setView(hasFallbackGeneration ? "editor" : "create");
      setDbNotice(message);
    }
  };

  const updatePlatformContent = (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => {
    setGeneration((current) => ({
      ...current,
      platforms: {
        ...current.platforms,
        [platform]: content,
      },
    }));
    setStatuses((current) => ({
      ...current,
      [platform]: content?.recommended ? "recommended" : "skip",
    }));
  };

  // Local-only update for changes the server has already persisted (e.g. a generated
  // image); unlike updatePlatformContent it never touches platform statuses.
  const patchPlatformContent = (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => {
    setGeneration((current) => ({
      ...current,
      platforms: {
        ...current.platforms,
        [platform]: content,
      },
    }));
  };

  const savePlatformContent = async (platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) => {
    const generationId = generation.generationIds?.[platform];
    if (!generationId) {
      throw new Error("This platform has not been persisted yet.");
    }

    const response = await fetch(`/api/generations/${generationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        status: statuses[platform] === "approved" ? "approved" : "draft",
      }),
    });
    const data = (await response.json()) as {
      platform?: PlatformKey;
      content?: GeneratedContent["platforms"][PlatformKey];
      error?: string;
    };

    if (!response.ok || !data.platform || !data.content) {
      throw new Error(data.error ?? "Could not save edits.");
    }

    updatePlatformContent(data.platform, data.content);
  };

  const regeneratePlatform = async (
    platform: PlatformKey,
    feedback: string,
    options?: { forceRecommended?: boolean },
  ) => {
    const generationId = generation.generationIds?.[platform];
    if (!generationId) {
      throw new Error("This platform has not been persisted yet.");
    }

    const response = await fetch("/api/regenerate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationId,
        feedback,
      }),
    });
    const data = (await response.json()) as {
      platform?: PlatformKey;
      content?: GeneratedContent["platforms"][PlatformKey];
      contentAnalysis?: GeneratedContent["contentAnalysis"];
      error?: string;
    };

    if (!response.ok || !data.platform || !data.content) {
      throw new Error(data.error ?? "Could not regenerate content.");
    }

    const nextContent = options?.forceRecommended
      ? {
          ...data.content,
          recommended: true,
          skipReason: null,
        }
      : data.content;

    if (options?.forceRecommended) {
      const saveResponse = await fetch(`/api/generations/${generationId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: nextContent,
          status: "draft",
        }),
      });
      const saveData = (await saveResponse.json()) as { error?: string };

      if (!saveResponse.ok) {
        throw new Error(saveData.error ?? "Could not save generated platform content.");
      }
    }

    setGeneration((current) => ({
      ...current,
      platforms: {
        ...current.platforms,
        [data.platform!]: nextContent,
      },
    }));
    setStatuses((current) => ({
      ...current,
      [data.platform!]: nextContent?.recommended ? "recommended" : "skip",
    }));
  };

  const approvePlatform = async (
    platform: PlatformKey,
    scheduledAt?: string,
    contentOverride?: GeneratedContent["platforms"][PlatformKey],
  ) => {
    const content = contentOverride ?? generation.platforms[platform];
    if (!content) {
      throw new Error("There is no content to approve for this platform.");
    }

    const generationId = generation.generationIds?.[platform];
    if (!generationId) {
      setStatuses((next) => ({
        ...next,
        [platform]: "approved",
      }));
      if (scheduledAt) {
        throw new Error("Generate or load a saved post before scheduling it.");
      }
      return;
    }

    const updateResponse = await fetch(`/api/generations/${generationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        status: "approved",
      }),
    });
    const updateData = (await updateResponse.json()) as { error?: string };

    if (!updateResponse.ok) {
      throw new Error(updateData.error ?? "Could not approve this post.");
    }

    setStatuses((next) => ({
      ...next,
      [platform]: "approved",
    }));
    setGeneration((current) => ({
      ...current,
      platforms: {
        ...current.platforms,
        ...(contentOverride ? { [platform]: contentOverride } : {}),
      },
      platformStatuses: {
        ...current.platformStatuses,
        [platform]: "approved",
      },
    }));

    if (!scheduledAt) return;

    // When Threads auto-posting is implemented, pass content.topicTag to the create-container call as
    // topic_tag. Threads requires 1-50 characters with no periods or ampersands.
    const scheduleResponse = await fetch("/api/scheduled-posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationId,
        sessionId: currentSessionId,
        platform,
        title: getPlatformTitle(platform, content),
        scheduledAt,
        content: getPlatformCopy(platform, content),
      }),
    });
    const scheduleData = (await scheduleResponse.json()) as { scheduledPost?: ScheduledPost; error?: string };

    if (!scheduleResponse.ok || !scheduleData.scheduledPost) {
      throw new Error(scheduleData.error ?? "Could not schedule this post.");
    }

    setScheduledPosts((items) =>
      [scheduleData.scheduledPost!, ...items.filter((item) => item.id !== scheduleData.scheduledPost!.id)].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    );
  };

  const copyScheduledPost = async (post: ScheduledPost) => {
    await copyToClipboard(post.content || post.title);
  };

  const viewScheduledPost = async (post: ScheduledPost) => {
    const session = post.sessionId ? sessions.find((item) => item.id === post.sessionId) : null;

    if (post.generationId && session) {
      await handleLoadSession(session);
    } else if (session) {
      setBrief(session.brief);
      setCurrentSessionId(session.id);
      setGeneration(sampleGeneration);
      setStatuses(initialStatuses);
    }

    if (generation.platforms[post.platform] || session) {
      setView("editor");
    }
  };

  const removeScheduledPost = async (post: ScheduledPost) => {
    const previousStatus = statuses[post.platform];
    setScheduledPosts((items) => items.filter((item) => item.id !== post.id));
    setStatuses((current) => ({ ...current, [post.platform]: "recommended" }));
    setGeneration((current) => ({
      ...current,
      platformStatuses: {
        ...current.platformStatuses,
        [post.platform]: "recommended",
      },
    }));

    if (!post.generationId) {
      return;
    }

    try {
      const response = await fetch(`/api/scheduled-posts?id=${encodeURIComponent(post.id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove scheduled post.");
      }
    } catch (caughtError) {
      setScheduledPosts((items) =>
        [post, ...items.filter((item) => item.id !== post.id)].sort(
          (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
        ),
      );
      setStatuses((current) => ({ ...current, [post.platform]: previousStatus }));
      throw caughtError;
    }
  };

  const publishLinkedInPost = async (contentOverride?: TextPlatformContent) => {
    const content = contentOverride ?? generation.platforms.linkedin;
    const generationId = generation.generationIds?.linkedin;

    if (!content || !("content" in content)) {
      throw new Error("There is no LinkedIn post text to publish.");
    }

    if (!generationId) {
      throw new Error("Generate or load a saved LinkedIn post before publishing.");
    }

    const existingScheduledPost = scheduledPosts.find(
      (item) => item.generationId === generationId && item.platform === "linkedin",
    );

    const response = await fetch("/api/linkedin/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        postText: getPlatformCopy("linkedin", content),
        generationId,
        scheduledPostId: existingScheduledPost?.id,
      }),
    });
    const data = (await response.json()) as { postId?: string; postUrl?: string; warnings?: string[]; error?: string };

    if (!response.ok || !data.postUrl) {
      throw new Error(data.error ?? "Could not publish to LinkedIn.");
    }

    setStatuses((next) => ({
      ...next,
      linkedin: "posted",
    }));
    setGeneration((current) => ({
      ...current,
      platforms: {
        ...current.platforms,
        linkedin: current.platforms.linkedin
          ? {
              ...current.platforms.linkedin,
              linkedInPostId: data.postId,
              linkedInPostUrl: data.postUrl,
              linkedInPublishedAt: new Date().toISOString(),
            }
          : current.platforms.linkedin,
      },
      platformStatuses: {
        ...current.platformStatuses,
        linkedin: "posted",
      },
    }));

    if (existingScheduledPost) {
      setScheduledPosts((items) =>
        items.map((item) =>
          item.id === existingScheduledPost.id ? { ...item, status: "posted", postUrl: data.postUrl } : item,
        ),
      );
    } else {
      const refreshResponse = await fetch("/api/scheduled-posts");
      const refreshData = (await refreshResponse.json()) as { scheduledPosts?: ScheduledPost[] };
      if (refreshData.scheduledPosts) {
        setScheduledPosts(refreshData.scheduledPosts);
      }
    }

    return { postUrl: data.postUrl };
  };

  const isCreateArea = view === "create" || view === "editor";
  const contextualTitle =
    view === "calendar"
      ? "Calendar"
      : view === "dashboard"
        ? "Dashboard"
        : brief.theme || (view === "editor" ? "Content editor" : "Untitled brief");
  const contextualLabel = view === "editor" ? "Create / Editor" : view === "create" ? "Create / Brief" : "Workspace";

  const navigatePrimary = (target: "create" | "calendar" | "dashboard") => {
    if (target === "create") {
      if (isCreateArea) {
        setIsSessionsOpen((current) => !current);
      } else {
        setView(lastCreateView);
        setIsSessionsOpen(true);
      }
      return;
    }

    setView(target);
    setIsSessionsOpen(false);
    setIsAssistantOpen(false);
  };

  const startNewSession = async () => {
    setLoadingSessionId("new");
    setIsSessionsOpen(true);
    try {
      await handleNewSession();
    } finally {
      setLoadingSessionId(null);
    }
  };

  const openSession = async (session: SessionSummary) => {
    setLoadingSessionId(session.id);
    try {
      await handleLoadSession(session);
    } finally {
      setLoadingSessionId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <PrimaryRail activeView={view} isGenerating={isGenerating} onNavigate={navigatePrimary} />

      {isCreateArea && isSessionsOpen ? (
        <>
          <button
            type="button"
            aria-label="Close sessions"
            onClick={() => setIsSessionsOpen(false)}
            className="fixed inset-0 left-[72px] z-30 bg-ink/10 backdrop-blur-[1px] xl:hidden"
          />
          <SessionsPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            notice={dbNotice}
            loadingSessionId={loadingSessionId}
            onClose={() => setIsSessionsOpen(false)}
            onLoadSession={(session) => void openSession(session)}
            onNewSession={() => void startNewSession()}
          />
        </>
      ) : null}

      <div className="min-w-0 flex flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-line bg-[#fefdf8]/95 px-4 shadow-[0_1px_2px_rgba(44,48,64,0.04)] backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {isCreateArea ? (
              <button
                type="button"
                aria-label={isSessionsOpen ? "Hide sessions" : "Show sessions"}
                onClick={() => setIsSessionsOpen((current) => !current)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition ${
                  isSessionsOpen
                    ? "border-[#8bade4]/55 bg-[#d3eafa]/75 text-violet"
                    : "border-line bg-white text-muted hover:border-[#8bade4]/55 hover:text-violet"
                }`}
              >
                <PanelIcon className="h-[18px] w-[18px]" />
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9096b0]">{contextualLabel}</p>
              <h1 className="truncate text-sm font-semibold text-ink sm:text-[15px]">{contextualTitle}</h1>
            </div>
          </div>

          {isCreateArea ? (
            <button
              type="button"
              onClick={() => setIsAssistantOpen((current) => !current)}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                isAssistantOpen
                  ? "border-[#8bade4]/55 bg-[#d3eafa]/75 text-violet"
                  : "border-line bg-white text-muted hover:border-[#8bade4]/55 hover:text-violet"
              }`}
            >
              <span aria-hidden="true" className="text-base leading-none">✦</span>
              <span className="hidden sm:inline">Assistant</span>
            </button>
          ) : null}
        </header>

        <main className="min-h-0 min-w-0 flex-1">
          <div className="flex min-h-[calc(100vh-4rem)]">
            <div className="min-w-0 flex-1">
              {view === "create" ? (
                <CreateView
                  brief={brief}
                  isAssistantOpen={isAssistantOpen}
                  isSaving={isGenerating}
                  dbNotice={dbNotice}
                  onBriefChange={setBrief}
                  onGenerate={handleGenerate}
                  onOpenAssistant={() => setIsAssistantOpen(true)}
                />
              ) : null}
              {view === "editor" ? (
                <EditorView
                  brief={brief}
                  generation={generation}
                  statuses={statuses}
                  onBack={() => setView("create")}
                  onSavePlatform={savePlatformContent}
                  onPatchPlatform={patchPlatformContent}
                  onRegeneratePlatform={regeneratePlatform}
                  onApprove={approvePlatform}
                  onPublishLinkedIn={publishLinkedInPost}
                />
              ) : null}
              {view === "calendar" ? (
                <CalendarView
                  scheduledPosts={scheduledPosts}
                  onCopyPost={copyScheduledPost}
                  onViewPost={viewScheduledPost}
                  onRemovePost={removeScheduledPost}
                />
              ) : null}
              {view === "dashboard" ? (
                <DashboardView scheduledPosts={scheduledPosts} onRemovePost={removeScheduledPost} />
              ) : null}
            </div>

            {isAssistantOpen && isCreateArea ? (
              <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[390px] pt-16 shadow-2xl lg:static lg:z-auto lg:max-w-none lg:pt-0 lg:shadow-none">
                <AssistantPanel
                  brief={brief}
                  sessionId={currentSessionId}
                  onClose={() => setIsAssistantOpen(false)}
                  onApply={(nextBrief) => setBrief(nextBrief)}
                  onSessionIdChange={setCurrentSessionId}
                />
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function PrimaryRail({
  activeView,
  isGenerating,
  onNavigate,
}: {
  activeView: ViewKey;
  isGenerating: boolean;
  onNavigate: (view: "create" | "calendar" | "dashboard") => void;
}) {
  const activePrimary = activeView === "editor" ? "create" : activeView;
  const items = [
    { key: "create" as const, label: "Create", icon: CreateIcon },
    { key: "calendar" as const, label: "Calendar", icon: CalendarIcon },
    { key: "dashboard" as const, label: "Dashboard", icon: DashboardIcon },
  ];

  return (
    <aside className="sticky top-0 z-50 flex h-screen w-[72px] shrink-0 flex-col border-r border-line bg-[#fefdf8]">
      <div className="grid h-16 shrink-0 place-items-center border-b border-line">
        <button
          type="button"
          onClick={() => onNavigate("create")}
          aria-label="Open Create workspace"
          className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-[#d3eafa] ring-1 ring-[#8bade4]/30 transition hover:bg-[#c6e2f7] focus:outline-none focus:ring-4 focus:ring-[#8bade4]/20"
        >
          <span className="font-serif text-lg font-bold text-[#536a91]">C</span>
        </button>
      </div>

      <nav aria-label="Primary navigation" className="flex flex-1 flex-col items-center gap-2 px-2 py-4">
        {items.map(({ key, label, icon: ItemIcon }) => {
          const active = activePrimary === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-[58px] w-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition ${
                active ? "bg-[#d3eafa]/70 text-violet" : "text-[#70778f] hover:bg-[#d3eafa]/40 hover:text-ink"
              }`}
            >
              {active ? <span className="absolute -left-2 top-3 h-8 w-[3px] rounded-r-full bg-[#8bade4]" /> : null}
              <ItemIcon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-2 border-t border-line py-4">
        <span
          className={`h-2 w-2 rounded-full ${isGenerating ? "animate-pulse bg-[#8bade4]" : "bg-emerald-400"}`}
          aria-label={isGenerating ? "Generating content" : "Workspace ready"}
        />
        <span className="text-[9px] font-semibold text-[#9096b0]">{isGenerating ? "Working" : "Ready"}</span>
      </div>
    </aside>
  );
}

function SessionsPanel({
  sessions,
  currentSessionId,
  notice,
  loadingSessionId,
  onClose,
  onLoadSession,
  onNewSession,
}: {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  notice: string | null;
  loadingSessionId: string | null;
  onClose: () => void;
  onLoadSession: (session: SessionSummary) => void;
  onNewSession: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredSessions = sessions.filter((session) => session.title.toLowerCase().includes(query.trim().toLowerCase()));
  const grouped = filteredSessions.reduce<Record<string, SessionSummary[]>>((acc, session) => {
    acc[session.date] = [...(acc[session.date] ?? []), session];
    return acc;
  }, {});

  return (
    <aside className="fixed inset-y-0 left-[72px] z-40 flex w-72 shrink-0 flex-col border-r border-line bg-[#fefdf8] shadow-2xl xl:sticky xl:top-0 xl:z-30 xl:h-screen xl:shadow-none">
        <div className="border-b border-line p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink">Sessions</h2>
              <p className="mt-0.5 text-xs text-[#9096b0]">Your recent work</p>
            </div>
          <button
            type="button"
            onClick={onClose}
              aria-label="Hide sessions"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-sm font-semibold text-muted transition hover:border-violet/40 hover:text-violet"
          >
            ✕
          </button>
          </div>

          <button
            type="button"
            onClick={onNewSession}
            disabled={loadingSessionId === "new"}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#8bade4] text-sm font-semibold text-[#252a3a] shadow-brand transition hover:bg-[#7a9edb] disabled:cursor-wait disabled:opacity-65"
          >
            <PlusIcon className="h-4 w-4" />
            {loadingSessionId === "new" ? "Starting…" : "New session"}
          </button>

          <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-muted transition focus-within:border-[#8bade4] focus-within:ring-4 focus-within:ring-[#8bade4]/10">
            <SearchIcon className="h-4 w-4 shrink-0" />
            <span className="sr-only">Search sessions</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sessions"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-[#9096b0]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {notice ? (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {notice}
            </p>
          ) : null}

          <div className="space-y-5">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9096b0]">{date}</p>
                <div className="space-y-1">
                  {items.map((session) => {
                    const active = currentSessionId === session.id;
                    const loading = loadingSessionId === session.id;
                    return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onLoadSession(session)}
                        disabled={loading}
                        className={`relative w-full rounded-lg border-l-[3px] px-3 py-2.5 text-left text-sm leading-5 transition ${
                          active
                            ? "border-[#8bade4] bg-[#d3eafa]/70 text-ink"
                            : "border-transparent text-slate-700 hover:border-[#8bade4]/60 hover:bg-[#d3eafa]/45 hover:text-ink"
                        } disabled:cursor-wait`}
                    >
                        <span className="block truncate font-medium">{session.title}</span>
                        <span className="mt-0.5 block text-[11px] text-[#9096b0]">{loading ? "Opening…" : date}</span>
                    </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {Object.keys(grouped).length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#9096b0]/40 bg-[#d3eafa]/20 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-ink">No sessions found</p>
                <p className="mt-1 text-xs leading-5 text-[#70778f]">Try another search or start a new session.</p>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
  );
}

const localHistoryKey = "crosscast.localHistory.v1";
const localHistorySessionLimit = 50;
const localHistoryDetailLimit = 20;

type LocalHistory = {
  sessions: SessionSummary[];
  details: Record<string, SessionDetail>;
};

function getLocalHistory(): LocalHistory {
  if (typeof window === "undefined") {
    return { sessions: fallbackSessions, details: {} };
  }

  try {
    const stored = window.localStorage.getItem(localHistoryKey);
    if (!stored) {
      return { sessions: fallbackSessions, details: {} };
    }

    const parsed = JSON.parse(stored) as Partial<LocalHistory>;
    return sanitizeLocalHistory({
      sessions: Array.isArray(parsed.sessions) && parsed.sessions.length ? parsed.sessions : fallbackSessions,
      details: parsed.details && typeof parsed.details === "object" ? parsed.details : {},
    });
  } catch {
    return { sessions: fallbackSessions, details: {} };
  }
}

function setLocalHistory(history: LocalHistory) {
  if (typeof window === "undefined") return;

  const safeHistory = sanitizeLocalHistory(history);

  try {
    window.localStorage.setItem(localHistoryKey, JSON.stringify(safeHistory));
  } catch (error) {
    console.warn("[Crosscast] Could not save local history cache.", error);

    try {
      window.localStorage.setItem(
        localHistoryKey,
        JSON.stringify({
          sessions: safeHistory.sessions.slice(0, 10),
          details: {},
        }),
      );
    } catch {
      window.localStorage.removeItem(localHistoryKey);
    }
  }
}

function getLocalSessionSummaries() {
  return getLocalHistory().sessions;
}

function getLocalSessionDetail(id: string) {
  return getLocalHistory().details[id] ?? null;
}

function mergeLocalHistory(sessions: SessionSummary[]) {
  const history = getLocalHistory();
  const mergedSessions = [...sessions, ...history.sessions.filter((session) => !sessions.some((item) => item.id === session.id))];

  setLocalHistory({
    ...history,
    sessions: mergedSessions,
  });
}

function saveLocalSession(session: SessionDetail) {
  const history = getLocalHistory();
  const summary: SessionSummary = {
    id: session.id,
    date: session.date,
    title: session.title,
    brief: session.brief,
  };

  setLocalHistory({
    sessions: [summary, ...history.sessions.filter((item) => item.id !== session.id)],
    details: {
      ...history.details,
      [session.id]: session,
    },
  });
}

function sanitizeLocalHistory(history: LocalHistory): LocalHistory {
  const sessions = history.sessions.slice(0, localHistorySessionLimit).map(sanitizeLocalSessionSummary);
  const details: Record<string, SessionDetail> = {};

  for (const session of sessions.slice(0, localHistoryDetailLimit)) {
    const detail = history.details[session.id];
    if (detail) {
      details[session.id] = sanitizeLocalSessionDetail(detail);
    }
  }

  return {
    sessions,
    details,
  };
}

function sanitizeLocalSessionSummary(session: SessionSummary): SessionSummary {
  return {
    ...session,
    brief: sanitizeLocalBrief(session.brief),
  };
}

function sanitizeLocalSessionDetail(session: SessionDetail): SessionDetail {
  return {
    ...session,
    brief: sanitizeLocalBrief(session.brief),
  };
}

function sanitizeLocalBrief(brief: BriefState): BriefState {
  const images = brief.images.filter((image) => !isBase64DataUrl(image.url));

  if (images.length === brief.images.length) {
    return brief;
  }

  return {
    ...brief,
    images,
  };
}

function isBase64DataUrl(value: string) {
  return value.startsWith("data:");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function buildStatuses(generation: GeneratedContent): Record<PlatformKey, PlatformStatus> {
  return {
    rednote: generation.platformStatuses?.rednote ?? platformStatus(generation.platforms.rednote?.recommended),
    threads: generation.platformStatuses?.threads ?? platformStatus(generation.platforms.threads?.recommended),
    linkedin: generation.platformStatuses?.linkedin ?? platformStatus(generation.platforms.linkedin?.recommended),
  };
}

function platformStatus(recommended: boolean | undefined): PlatformStatus {
  if (recommended === true) return "recommended";
  if (recommended === false) return "skip";
  return "skip";
}

function getPlatformTitle(platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) {
  if (!content) return "Untitled post";
  if (platform === "rednote" && "caption" in content) return getSelectedRedNoteTitle(content) || "Untitled RedNote post";
  return content.angle || `${platform} post`;
}

function getPlatformCopy(platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) {
  if (!content) return "";
  if (platform === "rednote" && "caption" in content) {
    return `${getSelectedRedNoteTitle(content)}\n\n${content.caption}`;
  }

  if ("content" in content) {
    return content.content;
  }

  return "";
}

function getSelectedRedNoteTitle(content: RedNoteContent) {
  const titleOptions = Array.isArray(content.titleOptions)
    ? content.titleOptions.filter((title) => title.trim().length > 0)
    : [];
  const options = titleOptions.length ? titleOptions : content.title ? [content.title] : [];
  const index =
    typeof content.selectedTitleIndex === "number" && Number.isInteger(content.selectedTitleIndex)
      ? Math.min(Math.max(content.selectedTitleIndex, 0), Math.max(options.length - 1, 0))
      : 0;
  return options[index] ?? "";
}
