"use client";

import { ImageIcon, PlusIcon, XIcon } from "./icons";
import type { BriefState } from "./types";

type CreateViewProps = {
  brief: BriefState;
  isAssistantOpen: boolean;
  isSaving: boolean;
  dbNotice: string | null;
  onBriefChange: (brief: BriefState) => void;
  onGenerate: () => void;
  onOpenAssistant: () => void;
};

export function CreateView({
  brief,
  isAssistantOpen,
  isSaving,
  dbNotice,
  onBriefChange,
  onGenerate,
  onOpenAssistant,
}: CreateViewProps) {
  const update = <K extends keyof BriefState>(key: K, value: BriefState[K]) => {
    onBriefChange({ ...brief, [key]: value });
  };

  const handleImages = (files: FileList | null) => {
    if (!files?.length) return;
    const nextImages = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    update("images", [...brief.images, ...nextImages]);
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
      <div className="mb-7 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Create New Content</h1>
        <div className="h-px w-40 bg-line" />
      </div>

      <div className="space-y-6">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Theme / Topic</span>
          <input
            value={brief.theme}
            onChange={(event) => update("theme", event.target.value)}
            placeholder='e.g. "How I use Claude to organize my morning tasks"'
            className="h-12 w-full rounded-md border border-line bg-white px-4 text-[15px] text-ink outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Raw Material</span>
          <div className="relative">
            <textarea
              value={brief.rawMaterial}
              onChange={(event) => update("rawMaterial", event.target.value)}
              placeholder="Write or paste your notes, ideas, key points..."
              rows={8}
              className="w-full rounded-md border border-line bg-white px-4 py-4 pr-40 text-[15px] leading-6 text-ink outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            />
            <label className="absolute bottom-4 right-4 inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink shadow-sm transition hover:border-slate-400">
              <ImageIcon className="h-4 w-4" />
              Add Images
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => handleImages(event.target.files)}
              />
            </label>
          </div>
        </label>

        {brief.images.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {brief.images.map((image) => (
              <div
                key={image.id}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-2 text-sm text-slate-700"
              >
                <img src={image.url} alt="" className="h-5 w-5 rounded object-cover" />
                <span className="max-w-40 truncate">{image.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${image.name}`}
                  onClick={() =>
                    update(
                      "images",
                      brief.images.filter((item) => item.id !== image.id),
                    )
                  }
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-ink"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Additional Context</span>
          <textarea
            value={brief.additionalContext}
            onChange={(event) => update("additionalContext", event.target.value)}
            placeholder='e.g. "This is for my 小红书 AI tools series"'
            rows={3}
            className="w-full rounded-md border border-line bg-white px-4 py-3 text-[15px] leading-6 text-ink outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />
        </label>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isSaving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-ink px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon className="h-4 w-4 rotate-45" />
            {isSaving ? "Generating..." : "Generate"}
          </button>
          <button
            type="button"
            onClick={onOpenAssistant}
            className={`inline-flex h-12 items-center justify-center rounded-md border px-6 text-sm font-semibold transition ${
              isAssistantOpen
                ? "border-slate-400 bg-slate-100 text-ink"
                : "border-line bg-white text-ink hover:border-slate-400"
            }`}
          >
            Help me develop this idea
          </button>
        </div>

        {dbNotice ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {dbNotice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
