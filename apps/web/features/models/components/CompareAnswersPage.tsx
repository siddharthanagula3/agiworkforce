'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, CircleAlert, Copy, Plus, X } from '@agiworkforce/icons';
import { getPlanMaxConcurrentTurns } from '@agiworkforce/types';
import { Spinner, translateUiPlural } from '@agiworkforce/ui';
import { useChatModelStore } from '@agiworkforce/unified-chat';
import { ProviderLogo } from '@features/chat/components/Composer/ProviderLogo';
import { SendButton } from '@features/chat/components/Composer/SendButton';
import { TranscriptNotice } from '@features/chat/components/messages/TranscriptNotice';
import { useModelCatalogue } from '@features/chat/lib/use-model-catalogue';
import { useModelFavourites } from '@features/chat/lib/use-model-favourites';
import { useModelStore } from '@shared/stores/model-store';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import {
  COMPARE_ANSWER_LIMIT,
  COMPARE_ANSWER_MINIMUM,
  answerableEntries,
  initialCompareModelIds,
} from '../lib/compare-answers';
import { useCompareAnswers, type CompareAnswer } from '../lib/use-compare-answers';

const MarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.MarkdownContent),
  { loading: () => <Spinner size="sm" /> },
);

const StreamingMarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.StreamingMarkdownContent),
  { loading: () => <Spinner size="sm" /> },
);

const PROMPT_MAX_HEIGHT_PX = 240;
const COPIED_RESET_MS = 2000;
const MILLISECONDS_PER_SECOND = 1000;
const CHAT_PATH = '/chat';
const MODELS_PATH = '/models';
const PLANS_PATH = '/pricing';

const ANSWER_GRID_CLASS: Readonly<Record<number, string>> = {
  [COMPARE_ANSWER_MINIMUM]: 'md:grid-cols-2',
  [COMPARE_ANSWER_LIMIT]: 'md:grid-cols-2 lg:grid-cols-3',
};
const FOCUS_RING_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]';
const SELECT_CLASS = `h-10 w-full min-w-0 rounded-lg border border-input bg-muted/40 px-3 text-sm text-foreground sm:w-60 pointer-coarse:min-h-11 ${FOCUS_RING_CLASS}`;
const ICON_BUTTON_CLASS = `flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${FOCUS_RING_CLASS}`;
const TEXT_BUTTON_CLASS = `inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11 ${FOCUS_RING_CLASS}`;

const FINISH_NOTES: Readonly<Record<string, string>> = {
  length: 'This answer reached the model’s length limit.',
  content_filter: 'The model stopped this answer under its safety rules.',
};

interface DeveloperGroup {
  key: string;
  label: string;
  entries: ModelCatalogueEntry[];
}

function groupByDeveloper(entries: readonly ModelCatalogueEntry[]): DeveloperGroup[] {
  const groups = new Map<string, DeveloperGroup>();
  for (const entry of entries) {
    const group = groups.get(entry.developer) ?? {
      key: entry.developer,
      label: entry.developerLabel,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(entry.developer, group);
  }
  return [...groups.values()];
}

function secondsLabel(milliseconds: number): string {
  return `${(milliseconds / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
}

function timingLabel(answer: CompareAnswer): string | null {
  const parts = [
    answer.firstTextMs !== null ? `First words in ${secondsLabel(answer.firstTextMs)}` : null,
    answer.totalMs !== null ? `Finished in ${secondsLabel(answer.totalMs)}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function concurrencyNote(limit: number): string {
  return translateUiPlural('models', 'counts.concurrentAnswers', limit, {
    one: 'Your plan runs {{count}} answer at a time, so the rest start as each one finishes.',
    other: 'Your plan runs {{count}} answers at a time, so the rest start as each one finishes.',
  });
}

export interface CompareAnswersPageProps {
  requestedModelIds: readonly string[];
}

export function CompareAnswersPage({ requestedModelIds }: CompareAnswersPageProps) {
  const router = useRouter();
  const catalogue = useModelCatalogue(true);
  const { favouriteModelIds } = useModelFavourites();
  const recentModelIds = useChatModelStore((state) => state.recentModelIds);
  const recordRecentModel = useChatModelStore((state) => state.selectModel);
  const setSelectedModelId = useModelStore((state) => state.setSelectedModelId);
  const { run, running, start, stop } = useCompareAnswers();

  const [chosenIds, setChosenIds] = useState<readonly string[] | null>(null);
  const [prompt, setPrompt] = useState('');
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const promptId = useId();
  const hintId = useId();

  const answerable = useMemo(() => answerableEntries(catalogue.entries), [catalogue.entries]);
  const groups = useMemo(() => groupByDeveloper(answerable), [answerable]);
  const entriesById = useMemo(
    () => new Map(catalogue.entries.map((entry) => [entry.id, entry])),
    [catalogue.entries],
  );
  const defaultIds = useMemo(
    () =>
      initialCompareModelIds(catalogue.entries, requestedModelIds, [
        ...recentModelIds,
        ...favouriteModelIds,
      ]),
    [catalogue.entries, favouriteModelIds, recentModelIds, requestedModelIds],
  );
  const slots = chosenIds ?? defaultIds;

  const planLimit = getPlanMaxConcurrentTurns(catalogue.planTier);
  const concurrency = planLimit === null ? slots.length : Math.max(1, planLimit);
  const canCompare = slots.length >= COMPARE_ANSWER_MINIMUM;
  const sendBlockedReason = !canCompare
    ? 'Choose at least two models to compare.'
    : prompt.trim()
      ? undefined
      : 'Send is off until you type a prompt.';

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, PROMPT_MAX_HEIGHT_PX)}px`;
  }, [prompt]);

  const nameOf = useCallback(
    (modelId: string) => entriesById.get(modelId)?.displayName ?? modelId,
    [entriesById],
  );

  const replaceSlot = (index: number, modelId: string) => {
    setChosenIds(slots.map((current, position) => (position === index ? modelId : current)));
  };

  const removeSlot = (index: number) => {
    setChosenIds(slots.filter((_, position) => position !== index));
  };

  const spareEntry =
    answerable.find(
      (entry) =>
        !slots.includes(entry.id) &&
        !slots.some((modelId) => entriesById.get(modelId)?.developer === entry.developer),
    ) ?? answerable.find((entry) => !slots.includes(entry.id));

  const addSlot = () => {
    if (spareEntry) setChosenIds([...slots, spareEntry.id]);
  };

  const send = () => {
    const text = prompt.trim();
    if (!text || !canCompare || running) return;
    setChosenIds(slots);
    start(text, slots, concurrency);
    setPrompt('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  const chatWith = useCallback(
    (modelId: string) => {
      recordRecentModel(modelId);
      setSelectedModelId(modelId);
      router.push(CHAT_PATH);
    },
    [recordRecentModel, router, setSelectedModelId],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link
        href={MODELS_PATH}
        className={`-ms-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11 ${FOCUS_RING_CLASS}`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Models
      </Link>
      <header className="mt-2">
        <h1 className="text-h2 text-foreground">Compare answers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send one prompt to two or three models and read their answers side by side.
        </p>
      </header>

      {catalogue.status === 'error' && catalogue.entries.length === 0 ? (
        <div role="alert" className="mt-6 flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">The model list could not be loaded.</p>
          <button
            type="button"
            onClick={catalogue.retry}
            className={`inline-flex h-9 items-center rounded-md border border-[var(--chat-border)] px-3 text-sm font-medium text-foreground hover:bg-muted pointer-coarse:min-h-11 ${FOCUS_RING_CLASS}`}
          >
            Try again
          </button>
        </div>
      ) : catalogue.status !== 'ready' ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span>Loading models…</span>
        </div>
      ) : answerable.length < COMPARE_ANSWER_MINIMUM ? (
        <div className="mt-6 flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            Comparing needs two models your plan includes, and yours includes fewer right now.
          </p>
          <Link
            href={PLANS_PATH}
            className={`inline-flex h-9 items-center rounded-md border border-[var(--chat-border)] px-3 text-sm font-medium text-foreground hover:bg-muted pointer-coarse:min-h-11 ${FOCUS_RING_CLASS}`}
          >
            See plans
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">Models to compare</legend>
              {slots.map((modelId, index) => (
                <div key={index} className="flex w-full min-w-0 items-center gap-1 sm:w-auto">
                  <select
                    aria-label={`Model ${index + 1}`}
                    value={modelId}
                    onChange={(event) => replaceSlot(index, event.target.value)}
                    className={SELECT_CLASS}
                  >
                    {groups.map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {group.entries.map((entry) => (
                          <option
                            key={entry.id}
                            value={entry.id}
                            disabled={entry.id !== modelId && slots.includes(entry.id)}
                          >
                            {entry.displayName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {slots.length > COMPARE_ANSWER_MINIMUM ? (
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      aria-label={`Remove ${nameOf(modelId)} from the comparison`}
                      className={ICON_BUTTON_CLASS}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
              {slots.length < COMPARE_ANSWER_LIMIT && spareEntry ? (
                <button type="button" onClick={addSlot} className={TEXT_BUTTON_CLASS}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add a model
                </button>
              ) : null}
            </fieldset>

            <div className="flex items-end gap-2 rounded-3xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] py-2 ps-4 pe-2 focus-within:ring-2 focus-within:ring-[var(--chat-focus-ring)]">
              <label htmlFor={promptId} className="sr-only">
                Prompt
              </label>
              <textarea
                id={promptId}
                ref={promptRef}
                rows={1}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                aria-describedby={hintId}
                placeholder="Ask every model the same thing"
                className="min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
              <SendButton
                mode={running ? 'stop' : 'send'}
                hasContent={prompt.trim().length > 0}
                disabled={!canCompare}
                disabledReason={sendBlockedReason}
                onClick={running ? stop : send}
              />
            </div>
            <p id={hintId} className="text-xs text-muted-foreground">
              Each answer counts as its own message on your plan. Nothing here is saved to your
              chats, and memory stays off so every model answers the same prompt.
              {concurrency < slots.length ? ` ${concurrencyNote(concurrency)}` : ''}
            </p>
          </form>

          {run ? (
            <section aria-label="Answers" className="mt-6">
              <div className="flex justify-end">
                <div className="flex max-w-[75%] flex-col items-end">
                  <p className="message-text user-bubble wrap-anywhere whitespace-pre-wrap">
                    {run.prompt}
                  </p>
                </div>
              </div>
              <div
                className={`mt-4 grid grid-cols-1 gap-4 ${ANSWER_GRID_CLASS[run.answers.length] ?? ''}`}
              >
                {run.answers.map((answer, index) => (
                  <AnswerPanel
                    key={`${index}-${answer.modelId}`}
                    answer={answer}
                    entry={entriesById.get(answer.modelId)}
                    resolvedName={
                      answer.resolvedModelId && answer.resolvedModelId !== answer.modelId
                        ? (entriesById.get(answer.resolvedModelId)?.displayName ?? null)
                        : null
                    }
                    queuedNote={concurrencyNote(concurrency)}
                    onChatWith={chatWith}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

interface AnswerPanelProps {
  answer: CompareAnswer;
  entry: ModelCatalogueEntry | undefined;
  resolvedName: string | null;
  queuedNote: string;
  onChatWith: (modelId: string) => void;
}

function AnswerPanel({ answer, entry, resolvedName, queuedNote, onChatWith }: AnswerPanelProps) {
  const headingId = useId();
  const [copied, setCopied] = useState(false);
  const name = entry?.displayName ?? answer.modelId;
  const timing = answer.phase === 'done' ? timingLabel(answer) : null;
  const finishNote = answer.finishReason ? FINISH_NOTES[answer.finishReason] : undefined;
  const settled = answer.phase === 'done' || answer.phase === 'stopped';

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer.text);
    } catch {
      toast.error('Could not copy the answer');
      return;
    }
    setCopied(true);
    toast.success('Answer copied');
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <article
      aria-labelledby={headingId}
      aria-busy={answer.phase === 'streaming'}
      data-testid="compare-answer"
      data-model-id={answer.modelId}
      className="flex min-w-0 flex-col rounded-xl border border-[var(--chat-border)] p-4"
    >
      <header className="flex items-center gap-2">
        <ProviderLogo providerKey={entry?.developer} size={16} />
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {name}
        </h2>
        {answer.phase === 'streaming' ? (
          <Spinner size="sm" aria-label={`${name} is answering`} />
        ) : answer.phase === 'stopped' ? (
          <span className="text-xs text-muted-foreground">Stopped</span>
        ) : null}
      </header>
      {resolvedName ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{`Answered by ${resolvedName}`}</p>
      ) : null}

      <div className="mt-3 min-w-0 flex-1">
        {answer.text ? (
          <div className="prose dark:prose-invert message-text max-w-none break-words">
            {answer.phase === 'streaming' ? (
              <StreamingMarkdownContent content={answer.text} isStreaming announce={false} />
            ) : (
              <MarkdownContent content={answer.text} />
            )}
          </div>
        ) : answer.phase === 'queued' ? (
          <p className="text-sm text-muted-foreground">{queuedNote}</p>
        ) : answer.phase === 'streaming' ? (
          <p className="text-sm text-muted-foreground">Waiting for the first words…</p>
        ) : answer.phase === 'stopped' ? (
          <p className="text-sm text-muted-foreground">Stopped before this model answered.</p>
        ) : answer.phase === 'done' ? (
          <p className="text-sm text-muted-foreground">This model returned an empty answer.</p>
        ) : null}
        {answer.error ? (
          <TranscriptNotice
            icon={CircleAlert}
            tone="danger"
            role="alert"
            message={answer.error}
            className={answer.text ? 'mt-3' : undefined}
          />
        ) : null}
        {finishNote ? (
          <TranscriptNotice icon={CircleAlert} message={finishNote} className="mt-3" />
        ) : null}
      </div>

      {settled && answer.text ? (
        <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--chat-border)] pt-2">
          {timing ? (
            <p role="status" className="text-xs text-muted-foreground">
              {timing}
            </p>
          ) : null}
          <div className="ms-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => void copyAnswer()}
              aria-label={
                copied ? `Copied the answer from ${name}` : `Copy the answer from ${name}`
              }
              className={ICON_BUTTON_CLASS}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => onChatWith(answer.modelId)}
              className={TEXT_BUTTON_CLASS}
            >
              {`Chat with ${name}`}
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  );
}
