"use client";

import { useMemo, useState } from "react";
import { CopyIcon, EyeIcon, TrashIcon } from "./icons";
import { platformMeta } from "./mock-data";
import type { PlatformKey, ScheduledPost } from "./types";

type CalendarViewProps = {
  scheduledPosts: ScheduledPost[];
  onCopyPost: (post: ScheduledPost) => Promise<void>;
  onViewPost: (post: ScheduledPost) => void;
  onRemovePost: (post: ScheduledPost) => Promise<void>;
};

type DashboardViewProps = {
  scheduledPosts: ScheduledPost[];
  onRemovePost: (post: ScheduledPost) => Promise<void>;
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const platformOrder: PlatformKey[] = ["rednote", "threads", "linkedin"];

export function CalendarView({ scheduledPosts, onCopyPost, onViewPost, onRemovePost }: CalendarViewProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyFallbackText, setCopyFallbackText] = useState<string | null>(null);
  const [removingPostId, setRemovingPostId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(visibleMonth);
  const postsByDay = useMemo(() => groupPostsByDay(scheduledPosts), [scheduledPosts]);
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const upcomingPosts = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now).getTime();
    const upcoming = scheduledPosts
      .filter((post) => new Date(post.scheduledAt).getTime() >= todayStart || post.status === "posted")
      .sort((a, b) => {
        if (a.status === "posted" && b.status !== "posted") return 1;
        if (a.status !== "posted" && b.status === "posted") return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      })
      .slice(0, 8);
    return upcoming;
  }, [scheduledPosts]);

  const copyPost = async (post: ScheduledPost) => {
    setCopyError(null);
    setCopyFallbackText(null);
    try {
      await onCopyPost(post);
      setCopiedPostId(post.id);
      window.setTimeout(() => setCopiedPostId(null), 1500);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not copy this post.";
      setCopyError(`${message} The post text is selected below so you can press Cmd+C.`);
      setCopyFallbackText(post.content || post.title);
    }
  };

  const removePost = async (post: ScheduledPost) => {
    setRemoveError(null);
    setRemovingPostId(post.id);
    try {
      await onRemovePost(post);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not remove this scheduled post.";
      setRemoveError(message);
    } finally {
      setRemovingPostId(null);
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Content Calendar</h1>
          <p className="mt-2 text-sm text-muted">Scheduled posts across RedNote, Threads, and LinkedIn.</p>
          <div className="mt-4 h-1 w-24 rounded-full bg-[#8bade4]" />
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted">
          {platformOrder.map((platform) => (
            <span key={platform} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${platformMeta[platform].dot}`} />
              {platformMeta[platform].label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-white p-5 shadow-workspace">
        <div className="mb-5 flex items-center justify-between gap-3">
          <IconButton label="Previous month" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>
            <span aria-hidden="true">‹</span>
          </IconButton>
          <h2 className="text-lg font-semibold text-ink">{monthLabel}</h2>
          <IconButton label="Next month" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>
            <span aria-hidden="true">›</span>
          </IconButton>
        </div>
        <div className="grid grid-cols-7 border-y border-line py-2 text-center text-xs font-semibold uppercase text-muted">
          {weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-b-md border-l border-line">
          {days.map((date) => {
            const dayPosts = postsByDay.get(formatDateKey(date)) ?? [];
            const isOutsideMonth = date.getMonth() !== visibleMonth.getMonth();
            return (
              <div key={date.toISOString()} className="min-h-24 border-b border-r border-line p-2 sm:min-h-28">
                <span className={`text-sm font-medium ${isOutsideMonth ? "text-slate-300" : "text-slate-700"}`}>
                  {date.getDate()}
                </span>
                {dayPosts.length ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {dayPosts.slice(0, 5).map((post) => (
                      <span
                        key={post.id}
                        title={`${platformMeta[post.platform].label}: ${post.title}`}
                        className={`h-2.5 w-2.5 rounded-full ${platformMeta[post.platform].dot}`}
                      />
                    ))}
                    {dayPosts.length > 5 ? <span className="text-[10px] font-semibold text-muted">+{dayPosts.length - 5}</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-ink">Upcoming & Published Posts</h2>
      {copyError ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{copyError}</p>
      ) : null}
      {removeError ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{removeError}</p>
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
      <div className="mt-3 space-y-3">
        {upcomingPosts.length ? (
          upcomingPosts.map((post) => (
            <div key={post.id} className="rounded-lg border border-line bg-white p-4 shadow-[0_12px_28px_rgba(8,10,53,0.04)]">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${platformMeta[post.platform].dot}`} />
                    <span className="truncate">{post.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {platformMeta[post.platform].label} · {formatDateTime(post.scheduledAt)}
                    {post.status === "posted" ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal">
                        Published
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  {post.postUrl ? (
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-teal/30 bg-white px-3 text-sm font-semibold text-teal transition hover:border-teal/50"
                    >
                      <EyeIcon className="h-4 w-4" />
                      View Post
                    </a>
                  ) : null}
                  <SmallButton
                    icon={<CopyIcon className="h-4 w-4" />}
                    label={copiedPostId === post.id ? "Copied" : "Copy"}
                    onClick={() => copyPost(post)}
                  />
                  <SmallButton icon={<EyeIcon className="h-4 w-4" />} label="View" onClick={() => onViewPost(post)} />
                  <SmallButton
                    icon={<TrashIcon className="h-4 w-4" />}
                    label={removingPostId === post.id ? "Removing..." : "Remove"}
                    onClick={() => removePost(post)}
                    disabled={removingPostId === post.id}
                    danger
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-line bg-white p-6 text-sm text-muted">
            No upcoming posts scheduled yet.
          </div>
        )}
      </div>
    </section>
  );
}

export function DashboardView({ scheduledPosts, onRemovePost }: DashboardViewProps) {
  const thisMonth = new Date();
  const monthPosts = scheduledPosts.filter((post) => isSameMonth(new Date(post.scheduledAt), thisMonth));
  const postedCount = monthPosts.filter((post) => post.status === "posted").length;
  const scheduledCount = monthPosts.length - postedCount;
  const recentPosts = [...scheduledPosts]
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .slice(0, 8);
  const [removingPostId, setRemovingPostId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const removePost = async (post: ScheduledPost) => {
    setRemoveError(null);
    setRemovingPostId(post.id);
    try {
      await onRemovePost(post);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not remove this scheduled post.";
      setRemoveError(message);
    } finally {
      setRemovingPostId(null);
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-2 text-sm text-muted">
        This month: {scheduledCount} scheduled{postedCount > 0 ? `, ${postedCount} published` : ""}.
      </p>
      <div className="mt-4 h-1 w-24 rounded-full bg-[#8bade4]" />
      {removeError ? (
        <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{removeError}</p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {platformOrder.map((platform) => {
          const meta = platformMeta[platform];
          const count = monthPosts.filter((post) => post.platform === platform).length;
          return (
            <div key={platform} className={`rounded-lg border p-5 ${meta.borderClass} ${meta.bgClass}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                <p className={`text-sm font-semibold ${meta.colorClass}`}>{meta.label}</p>
              </div>
              <p className={`mt-3 text-3xl font-semibold ${meta.colorClass}`}>{count}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-line bg-white shadow-workspace">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Recent Posts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Title</th>
                <th className="px-5 py-3 font-semibold">Platform</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-slate-700">
              {recentPosts.length ? (
                recentPosts.map((post) => (
                  <tr key={post.id}>
                    <td className="px-5 py-4 font-medium text-ink">{post.title}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${platformMeta[post.platform].dot}`} />
                        {platformMeta[post.platform].label}
                      </span>
                    </td>
                    <td className="px-5 py-4">{formatDateTime(post.scheduledAt)}</td>
                    <td className="px-5 py-4">{statusLabel(post.status)}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        {post.postUrl ? (
                          <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-teal/30 bg-white px-3 text-sm font-semibold text-teal transition hover:border-teal/50"
                          >
                            <EyeIcon className="h-4 w-4" />
                            View
                          </a>
                        ) : null}
                        <SmallButton
                          icon={<TrashIcon className="h-4 w-4" />}
                          label={removingPostId === post.id ? "Removing..." : "Remove"}
                          onClick={() => removePost(post)}
                          disabled={removingPostId === post.id}
                          danger
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-5 py-6 text-muted" colSpan={5}>
                    No recent posts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SmallButton({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        danger ? "border-rose-200 text-rose-700 hover:border-rose-300" : "border-line text-ink hover:border-violet/40 hover:text-violet"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-xl font-semibold text-ink transition hover:border-violet/40 hover:text-violet"
    >
      {children}
    </button>
  );
}

function buildCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const mondayIndex = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function groupPostsByDay(posts: ScheduledPost[]) {
  return posts.reduce<Map<string, ScheduledPost[]>>((acc, post) => {
    const key = formatDateKey(new Date(post.scheduledAt));
    acc.set(key, [...(acc.get(key) ?? []), post]);
    return acc;
  }, new Map());
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: ScheduledPost["status"]) {
  if (status === "posted")
    return <span className="inline-flex items-center rounded-full bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal">Published</span>;
  if (status === "approved")
    return <span className="inline-flex items-center rounded-full bg-violet/10 px-2 py-0.5 text-xs font-semibold text-violet">Approved</span>;
  if (status === "draft")
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Draft</span>;
  return <span className="inline-flex items-center rounded-full bg-amber/10 px-2 py-0.5 text-xs font-semibold text-amber">Scheduled</span>;
}
