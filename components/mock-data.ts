import type { BriefState, GeneratedContent, PlatformKey, PlatformStatus, ScheduledPost, SessionSummary } from "./types";

export const platformMeta: Record<
  PlatformKey,
  {
    label: string;
    shortLabel: string;
    dot: string;
    colorClass: string;
    borderClass: string;
    bgClass: string;
    ringClass: string;
  }
> = {
  rednote: {
    label: "RedNote",
    shortLabel: "小红书",
    dot: "bg-rednote",
    colorClass: "text-rednote",
    borderClass: "border-rednote",
    bgClass: "bg-rose-50",
    ringClass: "ring-rose-100",
  },
  threads: {
    label: "Threads",
    shortLabel: "Threads",
    dot: "bg-threads",
    colorClass: "text-threads",
    borderClass: "border-threads",
    bgClass: "bg-blue-50",
    ringClass: "ring-blue-100",
  },
  linkedin: {
    label: "LinkedIn",
    shortLabel: "LinkedIn",
    dot: "bg-linkedin",
    colorClass: "text-linkedin",
    borderClass: "border-linkedin",
    bgClass: "bg-emerald-50",
    ringClass: "ring-emerald-100",
  },
};

export const defaultBrief: BriefState = {
  theme: "",
  rawMaterial: "",
  additionalContext: "",
  images: [],
  selectedPlatforms: ["rednote", "threads", "linkedin"],
};

export const fallbackSessions: SessionSummary[] = [
  {
    id: "may-27-claude",
    date: "May 27",
    title: "Claude morning workflow",
    brief: {
      ...defaultBrief,
      theme: "How I use Claude to organize my morning tasks",
      rawMaterial:
        "I built a repeatable Claude workflow that converts messy reminders, calendar notes, and Slack follow-ups into a prioritized morning plan.",
      additionalContext: "For my 小红书 AI tools series.",
    },
  },
  {
    id: "may-25-bd",
    date: "May 25",
    title: "BD lessons from China GTM",
    brief: {
      ...defaultBrief,
      theme: "What cross-border founders miss about China BD",
      rawMaterial:
        "Notes from partner calls: trust-building matters more than a polished deck, and fast follow-up beats a perfect framework.",
      additionalContext: "Can become Threads or LinkedIn.",
    },
  },
];

export const sampleGeneration: GeneratedContent = {
  contentAnalysis: {
    contentType: "AI Tool Tutorial",
    summary:
      "A practical workflow showing how Kelly turns messy work inputs into a structured daily operating plan with Claude.",
  },
  platforms: {
    rednote: {
      recommended: true,
      skipReason: null,
      angle: "手把手教程 - replicable workflow",
      title: "Claude上班助手设置攻略",
      caption:
        "前几天我用 Claude 做了一个小 workflow，结果意外地有用。\n\n它可以把 Slack follow-up、日历事项、随手记的 todo 全部整理成一个 morning command center。\n\n我的用法很简单：\n1. 先把昨天没处理完的事项丢进去\n2. 加上今天的会议和重点目标\n3. 让 Claude 按紧急程度、耗时和依赖关系排序\n4. 最后生成一份可以直接照做的 morning plan\n\n最有用的是：它不是帮我“写计划”，而是帮我看清楚今天到底先做什么。",
      hashtags: ["#AI工具", "#效率神器", "#claudecode", "#vibecoding大赏", "#打工人日常", "#小红书运营", "#工作流"],
      carouselSlides: [
        {
          slideNumber: 1,
          content: "封面：Claude上班助手设置攻略",
          designNote: "Use a clean desktop screenshot crop with one red highlight around the final plan.",
        },
        {
          slideNumber: 2,
          content: "痛点：每天早上最难的不是开始，是判断先做什么。",
          designNote: "Large text, small messy-note background.",
        },
        {
          slideNumber: 3,
          content: "输入：昨天遗留事项 + 今天会议 + 关键目标。",
          designNote: "Three-column checklist with simple icons.",
        },
        {
          slideNumber: 4,
          content: "Prompt：请按 urgency、impact、dependency 帮我排序。",
          designNote: "Prompt block with copyable styling.",
        },
        {
          slideNumber: 5,
          content: "输出：90分钟 deep work + 3个 quick wins + follow-up list。",
          designNote: "Calendar-style plan preview.",
        },
        {
          slideNumber: 6,
          content: "结论：AI 最适合做你的 second brain sorter。",
          designNote: "Calm closing slide with one takeaway.",
        },
      ],
      postingTips: "Post with carousel screenshots and pin the exact prompt in the first comment.",
    },
    threads: {
      recommended: false,
      skipReason:
        "This is more of a copyable tutorial than a text-first strategic reflection. Threads can work only if reframed around the habit change.",
      angle: "Why morning planning fails without a decision filter",
      content:
        "The real value of AI for daily planning is not that it writes a better todo list.\n\nIt gives you a decision filter when everything feels equally urgent.\n\nI’ve started dumping meetings, follow-ups, loose notes, and yesterday’s leftovers into Claude, then asking it to rank by urgency, impact, and dependency.\n\nThe output is less magical than people expect, but more useful: a sane first 90 minutes.",
      postingTips: "Use only if you want a reflective angle instead of the tutorial.",
    },
    linkedin: {
      recommended: false,
      skipReason:
        "The raw material is tactical and creator-focused; LinkedIn needs a stronger operating lesson or team productivity frame.",
      angle: "AI as an operating cadence tool",
      content:
        "One underrated use case for AI at work: turning scattered operational inputs into a daily decision order.\n\nMost productivity systems assume the hard part is capturing tasks. In startup work, the harder part is sequencing them when priorities move quickly.\n\nI’ve been testing a simple Claude workflow: feed in yesterday’s unresolved items, today’s meetings, and the few outcomes that actually matter. Then ask it to prioritize by urgency, impact, and dependencies.\n\nThe result is not a perfect plan. It is a better starting point for judgment.",
      hashtags: ["#AI", "#Productivity", "#StartupOperations", "#GTM"],
      postingTips: "Only publish if reframed as an operations lesson for teams.",
    },
  },
};

export const initialStatuses: Record<PlatformKey, PlatformStatus> = {
  rednote: "recommended",
  threads: "skip",
  linkedin: "alternative",
};

export const fallbackScheduledPosts: ScheduledPost[] = [
  {
    id: "fallback-rednote-may-27",
    generationId: null,
    sessionId: "may-27-claude",
    platform: "rednote",
    title: "Claude上班助手设置攻略",
    scheduledAt: "2026-05-27T09:30:00.000Z",
    status: "scheduled",
    content: `${sampleGeneration.platforms.rednote!.title}\n\n${sampleGeneration.platforms.rednote!.caption}\n\n${sampleGeneration.platforms.rednote!.hashtags.join(" ")}`,
  },
  {
    id: "fallback-threads-may-27",
    generationId: null,
    sessionId: "may-27-claude",
    platform: "threads",
    title: "How I use Claude to organize my morning tasks",
    scheduledAt: "2026-05-27T12:00:00.000Z",
    status: "scheduled",
    content: sampleGeneration.platforms.threads!.content,
  },
  {
    id: "fallback-linkedin-may-29",
    generationId: null,
    sessionId: "may-27-claude",
    platform: "linkedin",
    title: "AI as an operating cadence tool",
    scheduledAt: "2026-05-29T05:00:00.000Z",
    status: "scheduled",
    content: `${sampleGeneration.platforms.linkedin!.content}\n\n${sampleGeneration.platforms.linkedin!.hashtags!.join(" ")}`,
  },
];
