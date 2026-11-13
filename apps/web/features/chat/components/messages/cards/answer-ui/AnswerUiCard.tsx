'use client';

import dynamic from 'next/dynamic';
import { useCallback, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  ExternalLink,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  TriangleAlert,
} from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import {
  answerUiChecklistText,
  answerUiControls,
  answerUiInitialValues,
  formatAnswerUiSliderValue,
  renderAnswerUiTemplate,
  type AnswerUiActionButton,
  type AnswerUiBlock,
  type AnswerUiCalloutTone,
  type AnswerUiCopyBlock,
  type AnswerUiFilesBlock,
  type AnswerUiKeyValueBlock,
  type AnswerUiStatusBlock,
  type AnswerUiStatusTone,
  type AnswerUiStepsBlock,
  type AnswerUiSuggestionsBlock,
  type AnswerUiTranscriptBlock,
  type AnswerUiCardBody,
  type AnswerUiChecklistBlock,
  type AnswerUiChoiceBlock,
  type AnswerUiControlBlock,
  type AnswerUiInputBlock,
  type AnswerUiSliderBlock,
  type AnswerUiValue,
  type AnswerUiValues,
  type InteractiveCardRenderContext,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { MapCardFallback } from '../MapCardFallback';
import { AnswerUiChart } from './AnswerUiChart';
import type { AnswerUiMapProps } from './AnswerUiMap';

const MarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.MarkdownContent),
  { loading: () => <div className="h-4 w-32 animate-pulse rounded-compact bg-muted" /> },
);

const AnswerUiMapLazy = dynamic<AnswerUiMapProps>(
  () => import('./AnswerUiMap').then((module) => module.AnswerUiMap),
  { ssr: false, loading: MapCardFallback },
);

export const ANSWER_UI_COPIED_MESSAGE = 'Copied';
export const ANSWER_UI_COPY_FAILED_MESSAGE =
  "Couldn't copy that. Select the text and copy it instead.";
export const ANSWER_UI_SEND_FAILED_MESSAGE =
  "Couldn't send that from the card. Type it in the message box instead.";
export const ANSWER_UI_CHECKLIST_RESET_LABEL = 'Reset';
export const ANSWER_UI_CHECKLIST_COPY_LABEL = 'Copy checklist';
const NEW_TAB_HINT = '(opens in a new tab)';

export interface AnswerUiCardContext extends InteractiveCardRenderContext {
  canSend?: boolean;
  sendBlockedReason?: string;
  onSendMessage?: (actionId: string, values: Record<string, AnswerUiValue>) => Promise<void>;
  trustedImageUrls?: readonly string[];
}

interface BlockScope {
  baseId: string;
  values: AnswerUiValues;
  controls: ReadonlyMap<string, AnswerUiControlBlock>;
  setValue: (id: string, value: AnswerUiValue) => void;
  resetValues: (ids?: readonly string[]) => void;
  ctx: AnswerUiCardContext;
  pendingAction: string | null;
  runSend: (button: AnswerUiActionButton) => void;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]';
const SECONDARY_BUTTON = cn(
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-base)] px-3 text-sm font-medium text-[color:var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none pointer-coarse:min-h-11',
  FOCUS_RING,
);
const PRIMARY_BUTTON = cn(
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--chat-accent-primary)] px-3 text-sm font-medium text-[color:var(--chat-accent-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none pointer-coarse:min-h-11',
  FOCUS_RING,
);
const FIELD_LABEL = 'text-sm font-medium text-[color:var(--chat-text-primary)]';
const LIVE_READOUT = 'text-sm text-[color:var(--chat-text-secondary)]';

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(ANSWER_UI_COPIED_MESSAGE);
  } catch {
    toast.error(ANSWER_UI_COPY_FAILED_MESSAGE);
  }
}

function domId(scope: BlockScope, id: string, suffix = ''): string {
  return `${scope.baseId}-${id}${suffix}`;
}

function Readout({ template, scope }: { template?: string; scope: BlockScope }) {
  if (!template) return null;
  return (
    <p aria-live="polite" data-testid="answer-ui-readout" className={LIVE_READOUT}>
      {renderAnswerUiTemplate(template, scope.controls, scope.values)}
    </p>
  );
}

function ChoiceControl({ block, scope }: { block: AnswerUiChoiceBlock; scope: BlockScope }) {
  const selected = (scope.values[block.id] as string[] | undefined) ?? [];
  if (block.style === 'dropdown') {
    const selectId = domId(scope, block.id);
    return (
      <div className="flex min-w-0 flex-col gap-1.5" data-testid="answer-ui-choice">
        <label htmlFor={selectId} className={FIELD_LABEL}>
          {block.label}
        </label>
        <select
          id={selectId}
          value={selected[0] ?? ''}
          onChange={(event) =>
            scope.setValue(block.id, event.target.value ? [event.target.value] : [])
          }
          className={cn(
            'h-10 w-full min-w-0 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-base)] px-3 text-sm text-[color:var(--chat-text-primary)] pointer-coarse:h-11',
            FOCUS_RING,
          )}
        >
          {selected.length === 0 ? <option value="">Choose…</option> : null}
          {block.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Readout template={block.readout} scope={scope} />
      </div>
    );
  }

  const multiple = block.style === 'checkbox';
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" data-testid="answer-ui-choice">
      <legend className={cn(FIELD_LABEL, 'mb-1')}>{block.label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.options.map((option) => {
          const inputId = domId(scope, block.id, `-${option.id}`);
          const checked = selected.includes(option.id);
          return (
            <label
              key={option.id}
              htmlFor={inputId}
              className={cn(
                'flex min-h-10 min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors motion-reduce:transition-none pointer-coarse:min-h-11',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--chat-focus-ring)]',
                checked
                  ? 'border-[var(--chat-accent-primary)] bg-[var(--chat-surface-hover)]'
                  : 'border-[var(--chat-border-strong)] hover:bg-[var(--chat-surface-hover)]',
              )}
            >
              <input
                id={inputId}
                type={multiple ? 'checkbox' : 'radio'}
                name={domId(scope, block.id)}
                value={option.id}
                checked={checked}
                onChange={() =>
                  scope.setValue(
                    block.id,
                    multiple
                      ? checked
                        ? selected.filter((id) => id !== option.id)
                        : [...selected, option.id]
                      : [option.id],
                  )
                }
                className="mt-0.5 size-4 shrink-0 accent-[var(--chat-accent-primary)] focus-visible:outline-none"
              />
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium text-[color:var(--chat-text-primary)]">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="block break-words text-sm text-[color:var(--chat-text-secondary)]">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <Readout template={block.readout} scope={scope} />
    </fieldset>
  );
}

function SliderControl({ block, scope }: { block: AnswerUiSliderBlock; scope: BlockScope }) {
  const inputId = domId(scope, block.id);
  const value =
    typeof scope.values[block.id] === 'number' ? (scope.values[block.id] as number) : block.value;
  const shown = formatAnswerUiSliderValue(block, value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="answer-ui-slider">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className={FIELD_LABEL}>
          {block.label}
        </label>
        <output
          htmlFor={inputId}
          data-testid="answer-ui-slider-value"
          className="shrink-0 text-sm font-semibold tabular-nums text-[color:var(--chat-text-primary)]"
        >
          {shown}
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        min={block.min}
        max={block.max}
        step={block.step}
        value={value}
        aria-valuetext={shown}
        onChange={(event) => scope.setValue(block.id, Number(event.target.value))}
        className={cn(
          'h-6 w-full cursor-pointer accent-[var(--chat-accent-primary)] pointer-coarse:h-11',
          FOCUS_RING,
        )}
      />
      <div
        aria-hidden="true"
        className="flex justify-between text-xs text-[color:var(--chat-text-muted)]"
      >
        <span>{formatAnswerUiSliderValue(block, block.min)}</span>
        <span>{formatAnswerUiSliderValue(block, block.max)}</span>
      </div>
      <Readout template={block.readout} scope={scope} />
    </div>
  );
}

function InputControl({ block, scope }: { block: AnswerUiInputBlock; scope: BlockScope }) {
  const inputId = domId(scope, block.id);
  const value =
    typeof scope.values[block.id] === 'string' ? (scope.values[block.id] as string) : block.value;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="answer-ui-input">
      <label htmlFor={inputId} className={FIELD_LABEL}>
        {block.label}
      </label>
      <input
        id={inputId}
        type={block.inputType}
        inputMode={block.inputType === 'number' ? 'decimal' : undefined}
        value={value}
        placeholder={block.placeholder}
        maxLength={400}
        onChange={(event) => scope.setValue(block.id, event.target.value)}
        className={cn(
          'h-10 w-full min-w-0 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-base)] px-3 text-base text-[color:var(--chat-text-primary)] placeholder:text-[color:var(--chat-text-placeholder)] pointer-coarse:h-11',
          FOCUS_RING,
        )}
      />
      <Readout template={block.readout} scope={scope} />
    </div>
  );
}

function Checklist({ block, scope }: { block: AnswerUiChecklistBlock; scope: BlockScope }) {
  const headingId = domId(scope, block.id, '-title');
  const checked = (scope.values[block.id] as string[] | undefined) ?? [];
  const done = block.items.filter((item) => checked.includes(item.id)).length;
  const percent = Math.round((done / block.items.length) * 100);
  return (
    <section
      aria-labelledby={headingId}
      data-testid="answer-ui-checklist"
      className="min-w-0 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 id={headingId} className="text-sm font-semibold text-[color:var(--chat-text-primary)]">
          {block.title ?? 'Checklist'}
        </h4>
        <p
          aria-live="polite"
          data-testid="answer-ui-checklist-progress"
          className="text-sm tabular-nums text-[color:var(--chat-text-secondary)]"
        >
          {done} of {block.items.length} done · {percent}%
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={`${block.title ?? 'Checklist'} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--chat-surface-hover)]"
      >
        <div
          className="h-full rounded-full bg-[var(--chat-accent-primary)] transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {block.items.map((item) => {
          const inputId = domId(scope, block.id, `-${item.id}`);
          const isChecked = checked.includes(item.id);
          return (
            <li key={item.id}>
              <label
                htmlFor={inputId}
                className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-[var(--chat-surface-hover)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={isChecked}
                  onChange={() =>
                    scope.setValue(
                      block.id,
                      isChecked ? checked.filter((id) => id !== item.id) : [...checked, item.id],
                    )
                  }
                  className="mt-0.5 size-4 shrink-0 accent-[var(--chat-accent-primary)] focus-visible:outline-none"
                />
                <span
                  className={cn(
                    'min-w-0 break-words text-sm',
                    isChecked
                      ? 'text-[color:var(--chat-text-secondary)] line-through'
                      : 'text-[color:var(--chat-text-primary)]',
                  )}
                >
                  {item.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => scope.resetValues([block.id])}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {ANSWER_UI_CHECKLIST_RESET_LABEL}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          onClick={() => void copyText(answerUiChecklistText(block, checked))}
        >
          <Copy className="size-4" aria-hidden="true" />
          {ANSWER_UI_CHECKLIST_COPY_LABEL}
        </button>
      </div>
    </section>
  );
}

const CALLOUT_ICONS: Record<AnswerUiCalloutTone, typeof CircleAlert> = {
  info: CircleAlert,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
};

const CALLOUT_ICON_TEXT: Record<AnswerUiCalloutTone, string> = {
  info: 'text-info-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
};

const STATUS_BADGE: Record<AnswerUiStatusTone, string> = {
  success: 'bg-success-fill/10 text-success-text',
  danger: 'bg-danger-fill/10 text-danger-text',
  warning: 'bg-warning-fill/10 text-warning-text',
  neutral: 'bg-[var(--chat-surface-hover)] text-[color:var(--chat-text-secondary)]',
};

function StatusBadge({ label, tone }: { label: string; tone: AnswerUiStatusTone }) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_BADGE[tone],
      )}
    >
      {label}
    </span>
  );
}

function ListTitle({ id, title }: { id: string; title?: string }) {
  if (!title) return null;
  return (
    <h4 id={id} className="text-sm font-semibold text-[color:var(--chat-text-primary)]">
      {title}
    </h4>
  );
}

const LIST_FRAME =
  'min-w-0 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]';

export const ANSWER_UI_FILE_EXAMPLE_LABEL = 'Example';
export const ANSWER_UI_COPY_READY_LABEL = 'Copy-ready';

function StatusList({ block, scope }: { block: AnswerUiStatusBlock; scope: BlockScope }) {
  const titleId = domId(scope, block.id, '-title');
  return (
    <section
      aria-labelledby={block.title ? titleId : undefined}
      data-testid="answer-ui-status"
      className={cn(LIST_FRAME, 'p-4')}
    >
      <ListTitle id={titleId} title={block.title} />
      <ul
        className={cn(
          'flex flex-col divide-y divide-[var(--chat-border-subtle)]',
          block.title && 'mt-2',
        )}
      >
        {block.items.map((item) => (
          <li key={item.id} className="flex min-w-0 items-start justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block break-words text-sm font-medium text-[color:var(--chat-text-primary)]">
                {item.label}
              </span>
              {item.note ? (
                <span className="block break-words text-sm text-[color:var(--chat-text-secondary)]">
                  {item.note}
                </span>
              ) : null}
            </span>
            <StatusBadge label={item.status} tone={item.tone} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps({ block, scope }: { block: AnswerUiStepsBlock; scope: BlockScope }) {
  const titleId = domId(scope, block.id, '-title');
  return (
    <section
      aria-labelledby={block.title ? titleId : undefined}
      data-testid="answer-ui-steps"
      className={cn(LIST_FRAME, 'p-4')}
    >
      <ListTitle id={titleId} title={block.title} />
      <ol className={cn('flex flex-col', block.title && 'mt-3')}>
        {block.items.map((item, index) => (
          <li key={item.id} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
            {index < block.items.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute start-3 top-7 h-[calc(100%-1.75rem)] w-px bg-[var(--chat-border-strong)]"
              />
            ) : null}
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface-base)] text-xs font-semibold tabular-nums text-[color:var(--chat-text-primary)]">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="break-words text-sm font-semibold text-[color:var(--chat-text-primary)]">
                  {item.title}
                </span>
                {item.status ? (
                  <StatusBadge label={item.status} tone={item.tone ?? 'neutral'} />
                ) : null}
              </div>
              {item.text ? (
                <div className="min-w-0 break-words [&_p:last-child]:mb-0 text-sm text-[color:var(--chat-text-secondary)]">
                  <MarkdownContent content={item.text} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function KeyValue({ block, scope }: { block: AnswerUiKeyValueBlock; scope: BlockScope }) {
  const titleId = domId(scope, block.id, '-title');
  return (
    <section
      aria-labelledby={block.title ? titleId : undefined}
      data-testid="answer-ui-keyvalue"
      className={cn(LIST_FRAME, 'p-4')}
    >
      <ListTitle id={titleId} title={block.title} />
      <dl
        className={cn(
          'grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
          block.title && 'mt-2',
        )}
      >
        {block.items.map((item, index) => (
          <div key={`${index}:${item.label}`} className="contents">
            <dt className="break-words text-sm text-[color:var(--chat-text-secondary)]">
              {item.label}
            </dt>
            <dd className="break-words text-sm font-medium text-[color:var(--chat-text-primary)]">
              {item.value || '-'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CopyReady({ block }: { block: AnswerUiCopyBlock }) {
  return (
    <section
      aria-label={block.title ?? ANSWER_UI_COPY_READY_LABEL}
      data-testid="answer-ui-copy"
      className={cn(LIST_FRAME, 'flex flex-col gap-3 p-4')}
    >
      {block.title || block.badge ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {block.title ? (
            <h4 className="break-words text-sm font-semibold text-[color:var(--chat-text-primary)]">
              {block.title}
            </h4>
          ) : null}
          {block.badge ? <StatusBadge label={block.badge} tone="neutral" /> : null}
        </div>
      ) : null}
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--chat-code-border)] bg-[var(--chat-code-bg)] p-3 font-[family-name:var(--chat-font-mono)] text-sm text-[color:var(--chat-code-text)]">
        {block.text}
      </pre>
      <button
        type="button"
        className={cn(PRIMARY_BUTTON, 'w-full')}
        onClick={() => void copyText(block.text)}
      >
        <Copy className="size-4" aria-hidden="true" />
        {block.buttonLabel}
      </button>
    </section>
  );
}

function Suggestions({ block, scope }: { block: AnswerUiSuggestionsBlock; scope: BlockScope }) {
  const blockedId = useId();
  const blocked = scope.ctx.canSend !== true;
  return (
    <div
      role="group"
      aria-label="Suggested follow-ups"
      data-testid="answer-ui-suggestions"
      className="flex min-w-0 flex-col items-start gap-2"
    >
      {block.items.map((item) => {
        const pending = scope.pendingAction === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-answer-ui-send={item.id}
            disabled={blocked || scope.pendingAction !== null}
            aria-describedby={blocked && scope.ctx.sendBlockedReason ? blockedId : undefined}
            aria-busy={pending || undefined}
            onClick={() =>
              scope.runSend({ id: item.id, label: item.text, action: 'send', primary: false })
            }
            className={cn(
              'group/pill inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--chat-border-strong)] px-3.5 py-1.5 text-start text-sm font-medium text-[color:var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[color:var(--chat-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none pointer-coarse:min-h-11',
              FOCUS_RING,
            )}
          >
            {pending ? (
              <Spinner size="sm" />
            ) : (
              <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 break-words">{item.text}</span>
          </button>
        );
      })}
      {blocked && scope.ctx.sendBlockedReason ? (
        <p id={blockedId} className="text-sm text-[color:var(--chat-text-muted)]">
          {scope.ctx.sendBlockedReason}
        </p>
      ) : null}
    </div>
  );
}

function fileIcon(fileType: string) {
  const type = fileType.toLowerCase();
  if (/^(png|jpe?g|gif|webp|svg|heic|image)$/.test(type)) return FileImage;
  if (/^(json)$/.test(type)) return FileJson;
  if (/^(csv|xlsx?|tsv|sheet)$/.test(type)) return FileSpreadsheet;
  if (/^(zip|tar|gz|7z|rar)$/.test(type)) return FileArchive;
  if (/^(js|ts|tsx|jsx|py|rs|go|java|rb|sh|html|css|sql|yaml|yml|toml|code)$/.test(type))
    return FileCode;
  if (/^(pdf|docx?|txt|md|rtf|pptx?|doc|text)$/.test(type)) return FileText;
  return File;
}

function Files({ block, scope }: { block: AnswerUiFilesBlock; scope: BlockScope }) {
  const titleId = domId(scope, block.id, '-title');
  return (
    <section
      aria-labelledby={block.title ? titleId : undefined}
      data-testid="answer-ui-files"
      className="flex min-w-0 flex-col gap-2"
    >
      <ListTitle id={titleId} title={block.title} />
      <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
        {block.items.map((item) => {
          const Icon = fileIcon(item.fileType);
          const body = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--chat-surface-hover)] text-[color:var(--chat-text-secondary)]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-all text-sm font-medium text-[color:var(--chat-text-primary)]">
                    {item.name}
                  </span>
                  <StatusBadge label={item.fileType} tone="neutral" />
                  {item.url ? null : (
                    <StatusBadge label={ANSWER_UI_FILE_EXAMPLE_LABEL} tone="neutral" />
                  )}
                </span>
                {item.description ? (
                  <span className="block break-words text-sm text-[color:var(--chat-text-secondary)]">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={item.id} className="min-w-0">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] p-3 hover:bg-[var(--chat-surface-hover)]',
                    FOCUS_RING,
                  )}
                >
                  {body}
                  <span className="sr-only"> {NEW_TAB_HINT}</span>
                </a>
              ) : (
                <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] p-3">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Transcript({ block, scope }: { block: AnswerUiTranscriptBlock; scope: BlockScope }) {
  const titleId = domId(scope, block.id, '-title');
  return (
    <section
      aria-labelledby={block.title ? titleId : undefined}
      data-testid="answer-ui-transcript"
      className={cn(LIST_FRAME, 'p-4')}
    >
      <ListTitle id={titleId} title={block.title} />
      <ol className={cn('flex flex-col gap-3', block.title && 'mt-3')}>
        {block.items.map((item, index) => (
          <li key={index} className="flex min-w-0 gap-3">
            {item.time ? (
              <span className="w-12 shrink-0 pt-px font-[family-name:var(--chat-font-mono)] text-xs tabular-nums text-[color:var(--chat-text-muted)]">
                {item.time}
              </span>
            ) : null}
            <p className="min-w-0 break-words text-sm text-[color:var(--chat-text-primary)]">
              {item.speaker ? <span className="font-semibold">{item.speaker}: </span> : null}
              {item.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function columnsClass(count: number): string {
  if (count >= 4) return 'sm:grid-cols-2 lg:grid-cols-4';
  if (count === 3) return 'sm:grid-cols-3';
  return 'sm:grid-cols-2';
}

function GalleryImage({
  url,
  alt,
  trustedImageUrls,
}: {
  url: string;
  alt: string;
  trustedImageUrls?: readonly string[];
}) {
  const safeAlt = alt.replace(/[[\]\\]/g, '');
  const safeUrl = url.replace(/[()\s<>]/g, (character) => encodeURIComponent(character));
  return (
    <MarkdownContent
      content={`![${safeAlt}](${safeUrl})`}
      skipPreprocess
      {...(trustedImageUrls ? { trustedImageUrls } : {})}
    />
  );
}

function ActionsRow({ buttons, scope }: { buttons: AnswerUiActionButton[]; scope: BlockScope }) {
  const blockedId = useId();
  const hasSend = buttons.some((button) => button.action === 'send');
  const showBlocked = hasSend && scope.ctx.canSend !== true && scope.ctx.sendBlockedReason;
  return (
    <div className="flex flex-col gap-1.5" data-testid="answer-ui-actions">
      <div className="flex flex-wrap gap-2">
        {buttons.map((button) => {
          const className = button.primary ? PRIMARY_BUTTON : SECONDARY_BUTTON;
          if (button.action === 'link' && button.url) {
            return (
              <a
                key={button.id}
                href={button.url}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {button.label}
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="sr-only"> {NEW_TAB_HINT}</span>
              </a>
            );
          }
          if (button.action === 'copy') {
            return (
              <button
                key={button.id}
                type="button"
                className={className}
                onClick={() =>
                  void copyText(
                    renderAnswerUiTemplate(button.template ?? '', scope.controls, scope.values),
                  )
                }
              >
                <Copy className="size-4" aria-hidden="true" />
                {button.label}
              </button>
            );
          }
          if (button.action === 'reset') {
            return (
              <button
                key={button.id}
                type="button"
                className={className}
                onClick={() => scope.resetValues()}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                {button.label}
              </button>
            );
          }
          const pending = scope.pendingAction === button.id;
          return (
            <button
              key={button.id}
              type="button"
              className={className}
              disabled={scope.ctx.canSend !== true || scope.pendingAction !== null}
              aria-describedby={showBlocked ? blockedId : undefined}
              aria-busy={pending || undefined}
              data-answer-ui-send={button.id}
              onClick={() => scope.runSend(button)}
            >
              {pending ? <Spinner size="sm" /> : null}
              {button.label}
            </button>
          );
        })}
      </div>
      {showBlocked ? (
        <p id={blockedId} className="text-sm text-[color:var(--chat-text-muted)]">
          {scope.ctx.sendBlockedReason}
        </p>
      ) : null}
    </div>
  );
}

function Block({ block, scope }: { block: AnswerUiBlock; scope: BlockScope }) {
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? (
        <h3 className="text-lg font-semibold text-[color:var(--chat-text-primary)]">
          {block.text}
        </h3>
      ) : (
        <h4 className="text-base font-semibold text-[color:var(--chat-text-primary)]">
          {block.text}
        </h4>
      );
    case 'text':
      return (
        <div
          className="min-w-0 break-words [&_p:last-child]:mb-0 text-[color:var(--chat-text-primary)]"
          data-testid="answer-ui-text"
        >
          <MarkdownContent
            content={block.markdown}
            {...(scope.ctx.trustedImageUrls
              ? { trustedImageUrls: scope.ctx.trustedImageUrls }
              : {})}
          />
        </div>
      );
    case 'callout': {
      const Icon = CALLOUT_ICONS[block.tone];
      return (
        <div
          role="note"
          data-testid="answer-ui-callout"
          data-tone={block.tone}
          className="flex min-w-0 gap-3 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)] px-4 py-3"
        >
          <Icon
            className={cn('mt-0.5 size-4 shrink-0', CALLOUT_ICON_TEXT[block.tone])}
            aria-hidden="true"
          />
          <div className="min-w-0 break-words [&_p:last-child]:mb-0 text-[color:var(--chat-text-primary)]">
            {block.title ? <p className="font-semibold">{block.title}</p> : null}
            <MarkdownContent content={block.markdown} />
          </div>
        </div>
      );
    }
    case 'card':
      return (
        <section
          aria-label={block.title}
          data-testid="answer-ui-card"
          className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] p-4"
        >
          {block.title || block.subtitle || block.badge ? (
            <header className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {block.title ? (
                  <h4 className="break-words text-base font-semibold text-[color:var(--chat-text-primary)]">
                    {block.title}
                  </h4>
                ) : null}
                {block.badge ? (
                  <StatusBadge label={block.badge} tone={block.badgeTone ?? 'neutral'} />
                ) : null}
              </div>
              {block.subtitle ? (
                <p className="break-words text-sm text-[color:var(--chat-text-secondary)]">
                  {block.subtitle}
                </p>
              ) : null}
            </header>
          ) : null}
          <BlockList blocks={block.blocks} scope={scope} />
        </section>
      );
    case 'columns':
      return (
        <div
          data-testid="answer-ui-columns"
          className={cn('grid min-w-0 gap-3', columnsClass(block.blocks.length))}
        >
          {block.blocks.map((child) => (
            <div key={child.id} className="flex min-w-0 flex-col">
              <Block block={child} scope={scope} />
            </div>
          ))}
        </div>
      );
    case 'disclosure':
      return (
        <details
          open={block.open}
          data-testid="answer-ui-disclosure"
          className="group min-w-0 rounded-2xl border border-[var(--chat-border-strong)]"
        >
          <summary
            className={cn(
              'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-sm font-semibold text-[color:var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)] [&::-webkit-details-marker]:hidden',
              FOCUS_RING,
            )}
          >
            <span className="min-w-0 break-words">{block.summary}</span>
            <ChevronDown
              className="size-4 shrink-0 text-[color:var(--chat-text-secondary)] transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 pt-1">
            <BlockList blocks={block.blocks} scope={scope} />
          </div>
        </details>
      );
    case 'table':
      return (
        <div
          role="region"
          aria-label={block.caption ?? 'Table'}
          tabIndex={0}
          data-testid="answer-ui-table"
          className={cn(
            'min-w-0 overflow-x-auto rounded-2xl border border-[var(--chat-border-strong)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)]',
          )}
        >
          <table className="w-full text-start text-sm">
            {block.caption ? (
              <caption className="px-3 pb-1 pt-3 text-start text-sm font-semibold text-[color:var(--chat-text-primary)]">
                {block.caption}
              </caption>
            ) : null}
            <thead>
              <tr className="border-b border-[var(--chat-border-subtle)]">
                {block.columns.map((column, index) => (
                  <th
                    key={`${index}:${column}`}
                    scope="col"
                    className="min-w-24 px-3 py-2 text-start font-medium text-[color:var(--chat-text-secondary)]"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-[var(--chat-border-subtle)] last:border-b-0"
                >
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <th
                        key={cellIndex}
                        scope="row"
                        className="px-3 py-2 text-start font-medium text-[color:var(--chat-text-primary)]"
                      >
                        {cell}
                      </th>
                    ) : (
                      <td
                        key={cellIndex}
                        className="px-3 py-2 text-[color:var(--chat-text-primary)]"
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'chart':
      return <AnswerUiChart block={block} controls={scope.controls} values={scope.values} />;
    case 'checklist':
      return <Checklist block={block} scope={scope} />;
    case 'choice':
      return <ChoiceControl block={block} scope={scope} />;
    case 'slider':
      return <SliderControl block={block} scope={scope} />;
    case 'input':
      return <InputControl block={block} scope={scope} />;
    case 'readout':
      return (
        <div
          data-testid="answer-ui-stat"
          className="min-w-0 rounded-2xl border border-[var(--chat-border-strong)] px-4 py-3"
        >
          <p className="text-sm text-[color:var(--chat-text-secondary)]">{block.label}</p>
          <output
            aria-live="polite"
            className="block break-words text-2xl font-semibold tabular-nums text-[color:var(--chat-text-primary)]"
          >
            {renderAnswerUiTemplate(block.value, scope.controls, scope.values)}
          </output>
        </div>
      );
    case 'gallery':
      return (
        <ul
          data-testid="answer-ui-gallery"
          className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {block.images.map((image) => (
            <li key={image.url} className="min-w-0">
              <figure className="flex min-w-0 flex-col gap-1">
                <GalleryImage
                  url={image.url}
                  alt={image.alt}
                  trustedImageUrls={scope.ctx.trustedImageUrls}
                />
                {image.caption ? (
                  <figcaption className="break-words text-sm text-[color:var(--chat-text-secondary)]">
                    {image.caption}
                  </figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ul>
      );
    case 'map':
      return <AnswerUiMapLazy block={block} />;
    case 'actions':
      return <ActionsRow buttons={block.buttons} scope={scope} />;
    case 'status':
      return <StatusList block={block} scope={scope} />;
    case 'steps':
      return <Steps block={block} scope={scope} />;
    case 'keyvalue':
      return <KeyValue block={block} scope={scope} />;
    case 'copy':
      return <CopyReady block={block} />;
    case 'suggestions':
      return <Suggestions block={block} scope={scope} />;
    case 'files':
      return <Files block={block} scope={scope} />;
    case 'transcript':
      return <Transcript block={block} scope={scope} />;
  }
}

function BlockList({ blocks, scope }: { blocks: AnswerUiBlock[]; scope: BlockScope }) {
  return (
    <>
      {blocks.map((block) => (
        <Block key={block.id} block={block} scope={scope} />
      ))}
    </>
  );
}

export interface AnswerUiCardProps {
  body: AnswerUiCardBody;
  label: string;
  ctx: AnswerUiCardContext;
}

export function AnswerUiCard({ body, label, ctx }: AnswerUiCardProps) {
  const baseId = useId().replace(/:/g, '');
  const controls = useMemo(() => answerUiControls(body), [body]);
  const initialValues = useMemo(() => answerUiInitialValues(body), [body]);
  const [values, setValues] = useState<Record<string, AnswerUiValue>>(initialValues);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { onSendMessage, canSend } = ctx;

  const setValue = useCallback((id: string, value: AnswerUiValue) => {
    setValues((current) => ({ ...current, [id]: value }));
  }, []);

  const resetValues = useCallback(
    (ids?: readonly string[]) => {
      setValues((current) => {
        if (!ids) return initialValues;
        const next = { ...current };
        for (const id of ids) {
          if (id in initialValues) next[id] = initialValues[id]!;
        }
        return next;
      });
    },
    [initialValues],
  );

  const runSend = useCallback(
    (button: AnswerUiActionButton) => {
      if (!onSendMessage || !canSend || pendingAction !== null) return;
      setPendingAction(button.id);
      onSendMessage(button.id, values)
        .catch(() => toast.error(ANSWER_UI_SEND_FAILED_MESSAGE))
        .finally(() => setPendingAction(null));
    },
    [onSendMessage, canSend, pendingAction, values],
  );

  const scope: BlockScope = {
    baseId,
    values,
    controls,
    setValue,
    resetValues,
    ctx,
    pendingAction,
    runSend,
  };

  return (
    <section
      aria-label={label}
      data-testid="interactive-card-answer-ui"
      className="my-3 flex min-w-0 flex-col gap-4"
    >
      {body.title ? (
        <h3 className="break-words text-lg font-semibold text-[color:var(--chat-text-primary)]">
          {body.title}
        </h3>
      ) : null}
      <BlockList blocks={body.blocks} scope={scope} />
    </section>
  );
}
