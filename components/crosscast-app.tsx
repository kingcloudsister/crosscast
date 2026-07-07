"use client";

import { useEffect, useState } from "react";
import { AssistantPanel } from "./assistant-panel";
import { CalendarView, DashboardView } from "./calendar-dashboard";
import { copyToClipboard } from "./clipboard";
import { CreateView } from "./create-view";
import { EditorView } from "./editor-view";
import { PlusIcon } from "./icons";
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

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white/92 px-4 shadow-[0_8px_28px_rgba(8,10,53,0.04)] backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={() => setView("create")}
          className="flex h-11 items-center rounded-md outline-none transition focus:ring-4 focus:ring-violet/15"
        >
          <img src="/crosscast-logo.png" alt="Crosscast" className="h-9 w-auto object-contain" />
        </button>
        <nav className="flex items-center gap-1 rounded-md border border-line bg-canvas/80 p-1 shadow-sm">
          {(["create", "calendar", "dashboard"] as ViewKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={`h-9 rounded px-3 text-sm font-semibold capitalize transition ${
                view === item ? "bg-white text-violet shadow-sm" : "text-muted hover:bg-white/70 hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <HistorySidebar
          sessions={sessions}
          notice={dbNotice}
          onLoadSession={handleLoadSession}
          onNewSession={handleNewSession}
        />

        <main className="min-w-0 flex-1">
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

            {isAssistantOpen && view === "create" ? (
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

function HistorySidebar({
  sessions,
  notice,
  onLoadSession,
  onNewSession,
}: {
  sessions: SessionSummary[];
  notice: string | null;
  onLoadSession: (session: SessionSummary) => void;
  onNewSession: () => void;
}) {
  const grouped = sessions.reduce<Record<string, SessionSummary[]>>((acc, session) => {
    acc[session.date] = [...(acc[session.date] ?? []), session];
    return acc;
  }, {});

  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-white/82 p-4 backdrop-blur md:block">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">History</h2>
        <button
          type="button"
          onClick={onNewSession}
          aria-label="New session"
          className="rounded-md border border-line p-2 text-muted transition hover:border-violet/40 hover:bg-violet/5 hover:text-violet"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {notice ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {notice}
        </p>
      ) : null}

      <div className="space-y-5">
        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <p className="mb-2 text-xs font-semibold uppercase text-muted">{date}</p>
            <div className="space-y-1">
              {items.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onLoadSession(session)}
                  className="w-full rounded-md px-2 py-2 text-left text-sm leading-5 text-slate-700 transition hover:bg-violet/5 hover:text-ink"
                >
                  <span className="block truncate">{session.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onNewSession}
        className="mt-8 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-violet text-sm font-semibold text-white shadow-brand transition hover:bg-ink"
      >
        <PlusIcon className="h-4 w-4" />
        New Session
      </button>
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
