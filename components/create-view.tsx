"use client";

import { useMemo, useState } from "react";
import { ArrowLeftIcon, CheckIcon, ImageIcon, PlusIcon, XIcon } from "./icons";
import { platformMeta } from "./mock-data";
import type { BriefState, PlatformKey, SessionSummary } from "./types";

type CreateStage = "landing" | "intake" | "questions" | "confirmation";
type QuestionKey = "goal" | "narrative" | "tone";
type Answers = Partial<Record<QuestionKey, string>>;

type CreateViewProps = {
  brief: BriefState;
  recentSession: SessionSummary | null;
  isSaving: boolean;
  dbNotice: string | null;
  onBriefChange: (brief: BriefState) => void;
  onContinue: (brief: BriefState) => void;
  onResumeRecent: (session: SessionSummary) => void;
};

const questions: Array<{
  key: QuestionKey;
  prompt: string;
  helper: string;
  options: string[];
}> = [
  {
    key: "goal",
    prompt: "What should this post do?",
    helper: "Choose the closest goal. You can make it more specific if needed.",
    options: ["Share an experience", "Teach something useful", "Start a conversation"],
  },
  {
    key: "narrative",
    prompt: "Which narrative feels closest?",
    helper: "This becomes the common story across the platforms you select.",
    options: ["A lesson I learned", "A build-in-public story", "A practical walkthrough"],
  },
  {
    key: "tone",
    prompt: "How should it feel?",
    helper: "Crosscast will adapt the expression for each platform later.",
    options: ["Direct and personal", "Warm and helpful", "Clear and analytical"],
  },
];

const suggestedIdeas = [
  {
    title: "The hidden work behind adapting one idea for three platforms",
    material: "Turn the process of building Crosscast into a specific build-in-public lesson about content operations.",
  },
  {
    title: "What founders misunderstand about consistent posting",
    material: "Consistency is often an operations problem, not an inspiration problem. Use a real recent workflow as evidence.",
  },
  {
    title: "A small product decision that changed how I work",
    material: "Choose one recent Crosscast product decision and explain the user behavior that changed your mind.",
  },
];

export function CreateView({
  brief,
  recentSession,
  isSaving,
  dbNotice,
  onBriefChange,
  onContinue,
  onResumeRecent,
}: CreateViewProps) {
  const hasMaterial = Boolean(brief.rawMaterial.trim() || brief.images.length);
  const [stage, setStage] = useState<CreateStage>(hasMaterial ? "confirmation" : "landing");
  const [isIdeasOpen, setIsIdeasOpen] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [customAnswer, setCustomAnswer] = useState("");
  const [narrativeSummary, setNarrativeSummary] = useState(getSavedNarrativeSummary(brief) || brief.theme);

  const update = <K extends keyof BriefState>(key: K, value: BriefState[K]) => {
    onBriefChange({ ...brief, [key]: value });
  };

  const currentQuestion = questions[questionIndex];
  const sourceCount = brief.images.length + (brief.rawMaterial.trim() ? 1 : 0);
  const recommendedPlatforms = useMemo<PlatformKey[]>(() => {
    const recommendations: PlatformKey[] = [];
    if (brief.images.length) recommendations.push("rednote");
    if (brief.rawMaterial.trim()) recommendations.push("threads", "linkedin");
    return recommendations.length ? recommendations : ["threads"];
  }, [brief.images.length, brief.rawMaterial]);

  const handleImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const nextImages = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: await readFileAsDataUrl(file),
      })),
    );
    update("images", [...brief.images, ...nextImages]);
  };

  const beginQuestions = () => {
    if (!hasMaterial) return;
    setQuestionIndex(0);
    setCustomAnswer(answers.goal ?? "");
    setStage("questions");
  };

  const chooseAnswer = (value: string) => {
    const nextAnswers = { ...answers, [currentQuestion.key]: value };
    questions.slice(questionIndex + 1).forEach((question) => delete nextAnswers[question.key]);
    setAnswers(nextAnswers);
    setCustomAnswer("");

    if (questionIndex === questions.length - 1) {
      setNarrativeSummary(buildNarrativeSummary(brief, nextAnswers));
      setStage("confirmation");
      return;
    }

    setQuestionIndex((current) => current + 1);
  };

  const goBackQuestion = () => {
    if (questionIndex === 0) {
      setStage("intake");
      return;
    }
    const previousIndex = questionIndex - 1;
    setQuestionIndex(previousIndex);
    setCustomAnswer(answers[questions[previousIndex].key] ?? "");
  };

  const chooseIdea = (idea: (typeof suggestedIdeas)[number]) => {
    onBriefChange({
      ...brief,
      theme: idea.title,
      rawMaterial: idea.material,
    });
    setNarrativeSummary(idea.title);
    setIsIdeasOpen(false);
    setStage("questions");
  };

  const togglePlatform = (platform: PlatformKey) => {
    const selected = brief.selectedPlatforms.includes(platform)
      ? brief.selectedPlatforms.filter((item) => item !== platform)
      : [...brief.selectedPlatforms, platform];
    update("selectedPlatforms", selected);
  };

  const generate = () => {
    const nextNarrativeSummary = narrativeSummary.trim() || getSavedNarrativeSummary(brief) || firstMeaningfulLine(brief.rawMaterial);
    const savedNarrativeSummary = getSavedNarrativeSummary(brief);
    const existingContext = brief.additionalContext
      .split("\n")
      .filter((line) => !line.trim().toLowerCase().startsWith("narrative summary:"))
      .join("\n")
      .trim();
    const context = [
      `Narrative summary: ${nextNarrativeSummary}`,
      answers.goal ? `Post goal: ${answers.goal}.` : "",
      answers.narrative ? `Narrative direction: ${answers.narrative}.` : "",
      answers.tone ? `Tone: ${answers.tone}.` : "",
      existingContext,
    ]
      .filter(Boolean)
      .join("\n");

    const nextBrief = {
      ...brief,
      theme: !savedNarrativeSummary || savedNarrativeSummary !== nextNarrativeSummary ? "Naming this project…" : brief.theme,
      additionalContext: context,
    };
    onBriefChange(nextBrief);
    onContinue(nextBrief);
  };

  return (
    <section className="mx-auto w-full max-w-[1040px] px-6 py-8 lg:px-10 lg:py-10">
      <CreateProgress stage={stage} />

      {stage === "landing" ? (
        <LandingStage
          recentSession={recentSession}
          isIdeasOpen={isIdeasOpen}
          onAddMaterial={() => setStage("intake")}
          onToggleIdeas={() => setIsIdeasOpen((open) => !open)}
          onChooseIdea={chooseIdea}
          onResumeRecent={onResumeRecent}
        />
      ) : null}

      {stage === "intake" ? (
        <IntakeStage
          brief={brief}
          sourceCount={sourceCount}
          onBriefChange={onBriefChange}
          onImages={handleImages}
          onBack={() => setStage("landing")}
          onContinue={beginQuestions}
        />
      ) : null}

      {stage === "questions" ? (
        <QuestionStage
          brief={brief}
          answers={answers}
          question={currentQuestion}
          questionIndex={questionIndex}
          customAnswer={customAnswer}
          onCustomAnswer={setCustomAnswer}
          onChooseAnswer={chooseAnswer}
          onBack={goBackQuestion}
        />
      ) : null}

      {stage === "confirmation" ? (
        <ConfirmationStage
          brief={brief}
          answers={answers}
          narrativeSummary={narrativeSummary || buildNarrativeSummary(brief, answers)}
          recommendedPlatforms={recommendedPlatforms}
          isSaving={isSaving}
          onNarrativeChange={setNarrativeSummary}
          onTogglePlatform={togglePlatform}
          onBack={() => {
            setQuestionIndex(questions.length - 1);
            setCustomAnswer(answers.tone ?? "");
            setStage("questions");
          }}
          onContinue={generate}
        />
      ) : null}

      {dbNotice ? (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {dbNotice}
        </p>
      ) : null}
    </section>
  );
}

function CreateProgress({ stage }: { stage: CreateStage }) {
  const activeIndex = stage === "landing" ? 0 : stage === "intake" ? 1 : stage === "questions" ? 2 : 3;
  return (
    <div className="mb-8 flex items-center gap-2" aria-label="Create progress">
      {["Start", "Sources", "Direction", "Platforms"].map((label, index) => (
        <div key={label} className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
              index <= activeIndex ? "bg-[#8bade4] text-[#252a3a]" : "bg-[#d3eafa]/55 text-[#9096b0]"
            }`}
          >
            {index < activeIndex ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
          </span>
          <span className={`hidden text-xs font-semibold sm:block ${index <= activeIndex ? "text-ink" : "text-[#9096b0]"}`}>
            {label}
          </span>
          {index < 3 ? <span className={`h-px flex-1 ${index < activeIndex ? "bg-[#8bade4]" : "bg-line"}`} /> : null}
        </div>
      ))}
    </div>
  );
}

function LandingStage({
  recentSession,
  isIdeasOpen,
  onAddMaterial,
  onToggleIdeas,
  onChooseIdea,
  onResumeRecent,
}: {
  recentSession: SessionSummary | null;
  isIdeasOpen: boolean;
  onAddMaterial: () => void;
  onToggleIdeas: () => void;
  onChooseIdea: (idea: (typeof suggestedIdeas)[number]) => void;
  onResumeRecent: (session: SessionSummary) => void;
}) {
  return (
    <div>
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7486a6]">Create something worth sharing</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-ink sm:text-5xl">What are we working with today?</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#70778f]">
          Bring the material you already have, or start from an idea Crosscast noticed for you.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={onAddMaterial}
          className="group min-h-48 rounded-2xl border border-[#8bade4]/45 bg-white p-6 text-left shadow-workspace transition hover:-translate-y-0.5 hover:border-[#8bade4] hover:shadow-lg"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#d3eafa] text-violet">
            <PlusIcon className="h-5 w-5" />
          </span>
          <h2 className="mt-6 text-lg font-semibold text-ink">Add my material</h2>
          <p className="mt-2 text-sm leading-6 text-[#70778f]">Paste notes or links, then add screenshots and images in one place.</p>
          <span className="mt-5 inline-flex text-sm font-semibold text-violet group-hover:translate-x-1 transition">Start with sources →</span>
        </button>

        <button
          type="button"
          onClick={onToggleIdeas}
          aria-expanded={isIdeasOpen}
          className="group min-h-48 rounded-2xl border border-line bg-[#d3eafa]/35 p-6 text-left transition hover:-translate-y-0.5 hover:border-[#8bade4]/65 hover:bg-[#d3eafa]/55"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#fefdf8] text-violet ring-1 ring-[#8bade4]/25">✦</span>
          <div className="mt-6 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Explore suggested ideas</h2>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#7486a6]">3 new</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#70778f]">A quick glimpse of possible stories from your recent work.</p>
          <span className="mt-5 inline-flex text-sm font-semibold text-violet">{isIdeasOpen ? "Hide ideas ↑" : "View ideas ↓"}</span>
        </button>
      </div>

      {isIdeasOpen ? (
        <div className="mt-4 rounded-2xl border border-line bg-white p-3 shadow-workspace">
          {suggestedIdeas.map((idea) => (
            <button
              key={idea.title}
              type="button"
              onClick={() => onChooseIdea(idea)}
              className="flex w-full items-center justify-between gap-5 rounded-xl px-4 py-3 text-left transition hover:bg-[#d3eafa]/40"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">{idea.title}</span>
                <span className="mt-1 block text-xs text-[#9096b0]">Suggested from your recent product work</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-violet">Use idea →</span>
            </button>
          ))}
        </div>
      ) : null}

      {recentSession ? (
        <button
          type="button"
          onClick={() => onResumeRecent(recentSession)}
          className="mt-7 flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-[#fefdf8] px-5 py-4 text-left transition hover:border-[#8bade4]/55 hover:bg-white"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#9096b0]">Continue recent project</span>
            <span className="mt-1 block truncate text-sm font-semibold text-ink">{recentSession.title}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-[#7486a6]">Updated {recentSession.date} →</span>
        </button>
      ) : null}
    </div>
  );
}

function IntakeStage({
  brief,
  sourceCount,
  onBriefChange,
  onImages,
  onBack,
  onContinue,
}: {
  brief: BriefState;
  sourceCount: number;
  onBriefChange: (brief: BriefState) => void;
  onImages: (files: FileList | null) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <StageHeading eyebrow="Your sources" title="Put everything in one place." description="Notes, links, screenshots, and images can stay messy. Crosscast will organize them before asking what you want to make." />
      <div className="mt-7 rounded-2xl border border-line bg-white p-5 shadow-workspace sm:p-6">
        <textarea
          value={brief.rawMaterial}
          onChange={(event) => onBriefChange({ ...brief, rawMaterial: event.target.value })}
          placeholder="Paste notes, links, rough thoughts, or source text…"
          rows={9}
          className="w-full resize-none bg-transparent text-[15px] leading-7 text-ink outline-none placeholder:text-[#a4a9ba]"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-[#fefdf8] px-3 text-sm font-semibold text-ink transition hover:border-[#8bade4]/55 hover:text-violet">
            <ImageIcon className="h-4 w-4" />
            Add screenshots or images
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => onImages(event.target.files)} />
          </label>
          <span className="text-xs font-semibold text-[#9096b0]">{sourceCount ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} added` : "Add at least one source"}</span>
        </div>
      </div>

      {brief.images.length ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {brief.images.map((image) => (
            <div key={image.id} className="group relative overflow-hidden rounded-xl border border-line bg-white">
              <img src={image.url} alt={image.name} className="h-28 w-full object-cover" />
              <div className="flex items-center gap-2 border-t border-line px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{image.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${image.name}`}
                  onClick={() => onBriefChange({ ...brief, images: brief.images.filter((item) => item.id !== image.id) })}
                  className="rounded p-1 text-[#9096b0] transition hover:bg-coral/10 hover:text-coral"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <StageActions onBack={onBack} onContinue={onContinue} continueDisabled={!brief.rawMaterial.trim() && !brief.images.length} continueLabel="Continue" />
    </div>
  );
}

function QuestionStage({
  brief,
  answers,
  question,
  questionIndex,
  customAnswer,
  onCustomAnswer,
  onChooseAnswer,
  onBack,
}: {
  brief: BriefState;
  answers: Answers;
  question: (typeof questions)[number];
  questionIndex: number;
  customAnswer: string;
  onCustomAnswer: (value: string) => void;
  onChooseAnswer: (value: string) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <StageHeading eyebrow="Shape the direction" title="A few quick questions." description="Crosscast only asks what it cannot confidently infer from your sources." />

      <div className="mt-6 rounded-xl border border-line bg-[#d3eafa]/25 px-4 py-3">
        <p className="line-clamp-2 text-sm leading-6 text-[#70778f]">{brief.rawMaterial || `${brief.images.length} uploaded images`}</p>
      </div>

      <div className="mt-5 space-y-3">
        {questions.slice(0, questionIndex).map((answeredQuestion) => (
          <div key={answeredQuestion.key} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3">
            <span className="text-sm text-[#70778f]">{answeredQuestion.prompt}</span>
            <span className="text-sm font-semibold text-ink">{answers[answeredQuestion.key]}</span>
          </div>
        ))}

        <div className="rounded-2xl border border-[#8bade4]/55 bg-white p-6 shadow-workspace">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7486a6]">Question {questionIndex + 1}</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{question.prompt}</h2>
          <p className="mt-2 text-sm leading-6 text-[#70778f]">{question.helper}</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChooseAnswer(option)}
                className="rounded-full border border-line bg-[#fefdf8] px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-[#8bade4] hover:bg-[#d3eafa]/50"
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <input
              value={customAnswer}
              onChange={(event) => onCustomAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && customAnswer.trim()) onChooseAnswer(customAnswer.trim());
              }}
              placeholder="Or write your own answer"
              className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-[#8bade4] focus:ring-4 focus:ring-[#8bade4]/10"
            />
            <button
              type="button"
              onClick={() => onChooseAnswer(customAnswer.trim())}
              disabled={!customAnswer.trim()}
              className="rounded-lg bg-[#8bade4] px-4 text-sm font-semibold text-ink transition hover:bg-[#7a9edb] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      <button type="button" onClick={onBack} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#70778f] transition hover:text-ink">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>
    </div>
  );
}

function ConfirmationStage({
  brief,
  answers,
  narrativeSummary,
  recommendedPlatforms,
  isSaving,
  onNarrativeChange,
  onTogglePlatform,
  onBack,
  onContinue,
}: {
  brief: BriefState;
  answers: Answers;
  narrativeSummary: string;
  recommendedPlatforms: PlatformKey[];
  isSaving: boolean;
  onNarrativeChange: (value: string) => void;
  onTogglePlatform: (platform: PlatformKey) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const platformOrder: PlatformKey[] = ["rednote", "threads", "linkedin"];
  return (
    <div>
      <StageHeading eyebrow="Confirm the direction" title="Here’s the story Crosscast will develop." description="Keep this concise. Each selected platform will adapt the same narrative in its own way." />

      <div className="mt-7 rounded-2xl border border-line bg-white p-6 shadow-workspace">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-[0.14em] text-[#7486a6]">Narrative summary</label>
            <p className="mt-1 text-xs leading-5 text-[#9096b0]">Core idea first, then what the audience should take away. Maximum two sentences.</p>
          </div>
          <span className="rounded-full bg-[#d3eafa]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7486a6]">Editable</span>
        </div>
        <textarea
          value={narrativeSummary}
          onChange={(event) => onNarrativeChange(event.target.value)}
          rows={3}
          className="mt-3 w-full resize-none rounded-xl border border-line bg-[#fefdf8] px-4 py-3 text-[15px] leading-7 text-ink outline-none transition focus:border-[#8bade4] focus:ring-4 focus:ring-[#8bade4]/10"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {[answers.goal, answers.narrative].filter(Boolean).map((answer) => (
            <span key={answer} className="rounded-full bg-[#d3eafa]/65 px-3 py-1 text-xs font-semibold text-[#536a91]">{answer}</span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-line bg-[#fefdf8] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9096b0]">Tone</p>
          <p className="mt-1 text-sm font-semibold text-ink">{answers.tone || "Use my usual voice"}</p>
        </div>
        <span className="text-xs text-[#9096b0]">Applied separately from the story</span>
      </div>

      <div className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7486a6]">Choose platforms</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Where should this story go?</h2>
          </div>
          <span className="text-xs font-semibold text-[#9096b0]">Select one or more</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {platformOrder.map((platform) => {
            const meta = platformMeta[platform];
            const selected = brief.selectedPlatforms.includes(platform);
            const recommended = recommendedPlatforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => onTogglePlatform(platform)}
                aria-pressed={selected}
                className={`relative rounded-2xl border p-5 text-left transition ${
                  selected
                    ? "border-[#8bade4] bg-[#d3eafa]/55 shadow-workspace"
                    : "border-line bg-white hover:border-[#8bade4]/55"
                }`}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                <span className="mt-4 block text-base font-semibold text-ink">{meta.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[#70778f]">Adapt the narrative to feel native on {meta.label}.</span>
                {recommended ? <span className="mt-4 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7486a6]">Recommended</span> : null}
                <span className={`absolute right-4 top-4 grid h-5 w-5 place-items-center rounded-full border ${selected ? "border-[#8bade4] bg-[#8bade4] text-white" : "border-line bg-white text-transparent"}`}>
                  <CheckIcon className="h-3 w-3" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <StageActions
        onBack={onBack}
        onContinue={onContinue}
        continueDisabled={!narrativeSummary.trim() || !brief.selectedPlatforms.length || isSaving}
        continueLabel={isSaving ? "Opening workspace…" : "Continue to platform drafts"}
      />
    </div>
  );
}

function StageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7486a6]">{eyebrow}</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      <p className="mt-3 text-[15px] leading-7 text-[#70778f]">{description}</p>
    </div>
  );
}

function StageActions({
  onBack,
  onContinue,
  continueDisabled,
  continueLabel,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
  continueLabel: string;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-4">
      <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#70778f] transition hover:text-ink">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-[#8bade4] px-5 text-sm font-semibold text-ink shadow-brand transition hover:bg-[#7a9edb] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {continueLabel}
      </button>
    </div>
  );
}

function buildNarrativeSummary(brief: BriefState, answers: Answers) {
  const coreIdea = cleanSentence(brief.theme.trim() || firstMeaningfulLine(brief.rawMaterial) || "A story from the supplied material");
  const audienceOutcome = audienceOutcomeFor(answers.goal);
  return `${coreIdea}. ${audienceOutcome}`;
}

function audienceOutcomeFor(goal?: string) {
  if (goal === "Share an experience") return "The audience should understand what changed and why it matters.";
  if (goal === "Teach something useful") return "The audience should leave with one useful idea they can apply.";
  if (goal === "Start a conversation") return "The audience should have a clear point of view they can respond to.";
  if (goal) return `The audience should ${cleanSentence(goal).toLowerCase()}.`;
  return "The audience should understand the central takeaway and why it matters.";
}

function cleanSentence(value: string) {
  return value.trim().replace(/[.!?]+$/, "");
}

function firstMeaningfulLine(value: string) {
  return value
    .split(/\n|[.!?]/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 120) ?? "";
}

function getSavedNarrativeSummary(brief: BriefState) {
  const line = brief.additionalContext
    .split("\n")
    .find((item) => item.trim().toLowerCase().startsWith("narrative summary:"));

  return line?.slice(line.indexOf(":") + 1).trim() ?? "";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
