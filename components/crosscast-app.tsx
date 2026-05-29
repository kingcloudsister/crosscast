"use client";

import { useEffect, useState } from "react";
import { AssistantPanel } from "./assistant-panel";
import { CalendarView, DashboardView } from "./calendar-dashboard";
import { CreateView } from "./create-view";
import { EditorView } from "./editor-view";
import { PlusIcon } from "./icons";
import { defaultBrief, fallbackScheduledPosts, fallbackSessions, initialStatuses, sampleGeneration } from "./mock-data";
import type {
  BriefState,
  GeneratedContent,
  PlatformKey,
  PlatformStatus,
  ScheduledPost,
  SessionDetail,
  SessionSummary,
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
        setDbNotice(null);
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Could not load sessions.";
        setDbNotice(message);
        setSessions(fallbackSessions);
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
      contentAnalysis: data.contentAnalysis ?? current.contentAnalysis,
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

  const approvePlatform = async (platform: PlatformKey, scheduledAt?: string) => {
    const content = generation.platforms[platform];
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

    if (!scheduledAt) return;

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
    await navigator.clipboard?.writeText(post.content || post.title);
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

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setView("create")}
          className="flex items-center gap-2 text-lg font-semibold tracking-normal text-ink"
        >
          <span className="text-xl">✦</span>
          Crosscast
        </button>
        <nav className="flex items-center gap-1 rounded-md border border-line bg-slate-50 p-1">
          {(["create", "calendar", "dashboard"] as ViewKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={`h-9 rounded px-3 text-sm font-semibold capitalize transition ${
                view === item ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <HistorySidebar sessions={sessions} onLoadSession={handleLoadSession} onNewSession={handleNewSession} />

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
                  generation={generation}
                  statuses={statuses}
                  onBack={() => setView("create")}
                  onSavePlatform={savePlatformContent}
                  onRegeneratePlatform={regeneratePlatform}
                  onApprove={approvePlatform}
                />
              ) : null}
              {view === "calendar" ? (
                <CalendarView scheduledPosts={scheduledPosts} onCopyPost={copyScheduledPost} onViewPost={viewScheduledPost} />
              ) : null}
              {view === "dashboard" ? <DashboardView scheduledPosts={scheduledPosts} /> : null}
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
  onLoadSession,
  onNewSession,
}: {
  sessions: SessionSummary[];
  onLoadSession: (session: SessionSummary) => void;
  onNewSession: () => void;
}) {
  const grouped = sessions.reduce<Record<string, SessionSummary[]>>((acc, session) => {
    acc[session.date] = [...(acc[session.date] ?? []), session];
    return acc;
  }, {});

  return (
    <aside className="hidden w-64 shrink-0 border-r border-line bg-white p-4 md:block">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">History</h2>
        <button
          type="button"
          onClick={onNewSession}
          aria-label="New session"
          className="rounded-md border border-line p-2 text-slate-600 transition hover:border-slate-400 hover:text-ink"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

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
                  className="w-full rounded-md px-2 py-2 text-left text-sm leading-5 text-slate-700 transition hover:bg-slate-50 hover:text-ink"
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
        className="mt-8 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        <PlusIcon className="h-4 w-4" />
        New Session
      </button>
    </aside>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function buildStatuses(generation: GeneratedContent): Record<PlatformKey, PlatformStatus> {
  return {
    rednote: platformStatus(generation.platforms.rednote?.recommended),
    threads: platformStatus(generation.platforms.threads?.recommended),
    linkedin: platformStatus(generation.platforms.linkedin?.recommended),
  };
}

function platformStatus(recommended: boolean | undefined): PlatformStatus {
  if (recommended === true) return "recommended";
  if (recommended === false) return "skip";
  return "skip";
}

function getPlatformTitle(platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) {
  if (!content) return "Untitled post";
  if (platform === "rednote" && "title" in content) return content.title || "Untitled RedNote post";
  return content.angle || `${platform} post`;
}

function getPlatformCopy(platform: PlatformKey, content: GeneratedContent["platforms"][PlatformKey]) {
  if (!content) return "";
  if (platform === "rednote" && "caption" in content) {
    return `${content.title}\n\n${content.caption}\n\n${content.hashtags.join(" ")}`;
  }

  if ("content" in content) {
    return `${content.content}${content.hashtags?.length ? `\n\n${content.hashtags.join(" ")}` : ""}`;
  }

  return "";
}
