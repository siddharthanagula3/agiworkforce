'use client';

import { useId, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import { getProviderOffering } from '@agiworkforce/types';
import {
  FREE_QUOTA_CATEGORIES,
  FREE_QUOTA_STATUS_LABELS,
} from '@/features/models/lib/free-quota-types';
import type { FreeModelSources } from '@features/chat/hooks/use-free-model-sources';
import {
  presentFreeModels,
  type FreeModelEntry,
  type FreeModelPool,
} from '@features/chat/lib/free-model-presentation';

const PICKER_ROW = { 'data-picker-row': '' };
const ROW_CLASS =
  'flex min-h-12 w-full shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-start transition-colors focus-visible:outline-none';
const ACTIVE_ROW_CLASS = `${ROW_CLASS} hover:bg-muted/60 focus-visible:bg-muted/60`;
const MUTED_ROW_CLASS = `${ROW_CLASS} cursor-default focus-visible:bg-muted/40`;
const NAME_CLASS = 'block truncate text-sm leading-5';
const GUIDANCE_CLASS = 'block truncate text-xs leading-4 text-muted-foreground';
const SUBHEADING_CLASS = 'px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground';
const NOTE_CLASS = 'px-3 py-2 text-xs leading-5 text-muted-foreground';

function lineRuns(entries: readonly FreeModelEntry[]): FreeModelEntry[][] {
  const runs: FreeModelEntry[][] = [];
  for (const entry of entries) {
    const run = runs[runs.length - 1];
    if (run?.[0]?.label.line === entry.label.line) run.push(entry);
    else runs.push([entry]);
  }
  return runs;
}

function joinIssuers(issuers: readonly string[]): string {
  return issuers.length > 1
    ? `${issuers.slice(0, -1).join(', ')} and ${issuers[issuers.length - 1]}`
    : (issuers[0] ?? '');
}

function readyGuidance(entry: FreeModelEntry, promotional: boolean): string {
  if (promotional) return 'Free promotion · text chat · provider quota applies';
  const { model, label } = entry;
  const use = getProviderOffering(model.key)?.quotaChatImageInput
    ? 'image chat'
    : FREE_QUOTA_CATEGORIES[model.category].toLowerCase();
  const allocation = model.expiresOn ? `expires ${model.expiresOn}` : 'limited allocation';
  return [label.version, 'Free quota', use, allocation].filter(Boolean).join(' · ');
}

function unavailableReason(entry: FreeModelEntry): string {
  const { status, expiresOn } = entry.model;
  const reason = FREE_QUOTA_STATUS_LABELS[status];
  return [
    entry.label.version,
    status === 'expired' && expiresOn ? `${reason} ${expiresOn}` : reason,
  ]
    .filter(Boolean)
    .join(' · ');
}

function unavailableExplanation(entry: FreeModelEntry, fallbackModelName: string | null): string {
  const { issuer, model, label } = entry;
  const nextStep = fallbackModelName
    ? `Choose ${fallbackModelName} or another free model.`
    : 'Choose another free model.';
  if (model.status === 'exhausted') {
    return `${issuer}'s free allowance for ${label.displayName} is used up. It is the provider's allowance, not a limit on your account. ${nextStep}`;
  }
  if (model.status === 'expired') {
    return `${issuer}'s free offer for ${label.displayName} ended${model.expiresOn ? ` on ${model.expiresOn}` : ''}. ${nextStep}`;
  }
  return `${label.displayName} from ${issuer} is not available right now. ${nextStep}`;
}

function pauseNotice(pools: readonly FreeModelPool[], fallbackModelName: string | null): string {
  const paused = pools.filter((pool) => pool.pause === 'paused').map((pool) => pool.issuer);
  const usedUp = pools.filter((pool) => pool.pause === 'used_up').map((pool) => pool.issuer);
  if (pools.every((pool) => pool.pause)) {
    const state =
      paused.length > 0
        ? 'Free models are paused right now.'
        : 'Free model allowances are used up.';
    return fallbackModelName
      ? `${state} Keep chatting with ${fallbackModelName}, or check back later.`
      : `${state} Check back later.`;
  }
  return [
    paused.length > 0 ? `${joinIssuers(paused)} free models are paused right now.` : null,
    usedUp.length > 0 ? `${joinIssuers(usedUp)} free allowances are used up.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function ReadyRow({
  entry,
  promotional,
  selected,
  onSelect,
}: {
  entry: FreeModelEntry;
  promotional: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const guidanceId = useId();
  return (
    <button
      type="button"
      {...PICKER_ROW}
      aria-pressed={selected}
      aria-label={entry.label.displayName}
      aria-describedby={guidanceId}
      onClick={() => onSelect(entry.model.key)}
      className={ACTIVE_ROW_CLASS}
    >
      <span className="min-w-0 flex-1">
        <span className={`${NAME_CLASS} text-foreground ${selected ? 'font-medium' : ''}`}>
          {entry.label.name}
        </span>
        <span id={guidanceId} className={GUIDANCE_CLASS}>
          {readyGuidance(entry, promotional)}
        </span>
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

function UnavailableRow({
  entry,
  selected,
  explanation,
  onExplain,
}: {
  entry: FreeModelEntry;
  selected: boolean;
  explanation: string | null;
  onExplain: (id: string) => void;
}) {
  const reasonId = useId();
  const explanationId = useId();
  return (
    <>
      <button
        type="button"
        {...PICKER_ROW}
        aria-disabled="true"
        aria-pressed={selected}
        aria-label={entry.label.displayName}
        aria-describedby={explanation ? `${reasonId} ${explanationId}` : reasonId}
        onClick={() => onExplain(entry.model.key)}
        className={MUTED_ROW_CLASS}
      >
        <span className="min-w-0 flex-1">
          <span className={`${NAME_CLASS} text-muted-foreground`}>{entry.label.name}</span>
          <span id={reasonId} className={GUIDANCE_CLASS}>
            {unavailableReason(entry)}
          </span>
        </span>
        {selected && (
          <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
      <p
        id={explanationId}
        role="status"
        className={explanation ? 'px-3 pb-2 text-xs leading-5 text-foreground' : undefined}
      >
        {explanation}
      </p>
    </>
  );
}

function Disclosure({
  label,
  count,
  open,
  controls,
  onToggle,
}: {
  label: string;
  count: number;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      {...PICKER_ROW}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={`${ACTIVE_ROW_CLASS} min-h-11 text-sm text-foreground`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
      <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export function FreeQuotaModelSection({
  sources,
  selectedId,
  onSelect,
  fallbackModelName,
  children,
}: {
  sources: FreeModelSources;
  selectedId: string;
  onSelect: (id: string) => void;
  fallbackModelName: string | null;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const [explainedId, setExplainedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const moreId = useId();
  const unavailableId = useId();
  const { quota, experiential } = sources;
  if (!children && quota.status === 'hidden' && experiential.status === 'hidden') return null;

  const catalogues = [quota.catalogue, experiential.catalogue].filter(
    (catalogue) => catalogue !== null,
  );
  const view = presentFreeModels(catalogues, { category, selectedId });
  const promotionalIssuer = experiential.catalogue?.issuer ?? null;
  const loading = quota.status === 'loading' || experiential.status === 'loading';
  const listedPools = view.pools.filter((pool) => !pool.pause);
  const pausedPools = view.pools.filter((pool) => pool.pause);
  const needle = query.trim().toLowerCase();
  const more = listedPools
    .map((pool) => ({
      issuer: pool.issuer,
      entries: pool.more.filter(
        (entry) =>
          !needle ||
          entry.label.displayName.toLowerCase().includes(needle) ||
          (entry.model.providerModelId ?? '').toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.entries.length > 0);
  const moreCount = listedPools.reduce((total, pool) => total + pool.more.length, 0);
  const unavailable = listedPools.filter((pool) => pool.unavailable.length > 0);
  const unavailableCount = unavailable.reduce((total, pool) => total + pool.unavailable.length, 0);
  const groupedByIssuer = listedPools.length > 1;

  const renderEntry = (entry: FreeModelEntry) =>
    entry.model.status === 'ready' ? (
      <ReadyRow
        key={entry.model.key}
        entry={entry}
        promotional={entry.issuer === promotionalIssuer}
        selected={entry.model.key === selectedId}
        onSelect={onSelect}
      />
    ) : (
      <UnavailableRow
        key={entry.model.key}
        entry={entry}
        selected={entry.model.key === selectedId}
        explanation={
          explainedId === entry.model.key
            ? unavailableExplanation(
                entry,
                entry.model.category === 'chat' ? fallbackModelName : null,
              )
            : null
        }
        onExplain={setExplainedId}
      />
    );

  return (
    <div className="border-b border-[var(--chat-border)]">
      <button
        type="button"
        {...PICKER_ROW}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted/60"
      >
        Free <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {expanded && (
        <div className="pb-2">
          {children}
          {view.categories.length > 1 && (
            <div className="px-3 py-1">
              <select
                {...PICKER_ROW}
                aria-label="Free model category"
                value={view.category ?? ''}
                onChange={(event) => setCategory(event.target.value)}
                className="h-9 w-full rounded-md border border-[var(--chat-border)] bg-background px-2 text-sm text-foreground"
              >
                {view.categories.map((key) => (
                  <option key={key} value={key}>
                    {FREE_QUOTA_CATEGORIES[key]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {view.pinned && renderEntry(view.pinned)}
          {listedPools.map((pool) => (
            <div key={pool.issuer} role="group" aria-label={`${pool.issuer} free models`}>
              {pool.issuer === promotionalIssuer && (
                <>
                  <p className={SUBHEADING_CLASS}>{`${pool.issuer} · Free`}</p>
                  <p className="px-3 text-xs leading-5 text-muted-foreground">
                    These models get only your messages, not your instructions or memory: their
                    providers have not said they keep prompts out of training.
                  </p>
                  <a
                    {...PICKER_ROW}
                    href="/privacy"
                    className="mx-3 inline-block text-xs text-muted-foreground underline"
                  >
                    Data use
                  </a>
                </>
              )}
              {pool.featured.map(renderEntry)}
            </div>
          ))}
          {moreCount > 0 && (
            <>
              <Disclosure
                label="More models"
                count={moreCount}
                open={moreOpen}
                controls={moreId}
                onToggle={() => setMoreOpen(!moreOpen)}
              />
              {moreOpen && (
                <div id={moreId} role="group" aria-label="More free models">
                  <div className="px-3 py-1">
                    <input
                      {...PICKER_ROW}
                      type="search"
                      aria-label="Search free models"
                      placeholder="Search free models"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-9 w-full rounded-md border border-[var(--chat-border)] bg-transparent px-2 text-sm text-foreground"
                    />
                  </div>
                  {more.flatMap((group) =>
                    lineRuns(group.entries).map((line) => (
                      <div key={`${group.issuer}:${line[0]!.label.line}`}>
                        <p className={SUBHEADING_CLASS}>{line[0]!.label.line}</p>
                        {line.map(renderEntry)}
                      </div>
                    )),
                  )}
                  {more.length === 0 && <p className={NOTE_CLASS}>No free models match.</p>}
                </div>
              )}
            </>
          )}
          {unavailableCount > 0 && (
            <>
              <Disclosure
                label="Unavailable"
                count={unavailableCount}
                open={unavailableOpen}
                controls={unavailableId}
                onToggle={() => setUnavailableOpen(!unavailableOpen)}
              />
              {unavailableOpen && (
                <div id={unavailableId} role="group" aria-label="Unavailable free models">
                  {unavailable.map((pool) => (
                    <div key={pool.issuer}>
                      {groupedByIssuer && <p className={SUBHEADING_CLASS}>{pool.issuer}</p>}
                      {pool.unavailable.map(renderEntry)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {pausedPools.length > 0 && (
            <p {...PICKER_ROW} tabIndex={-1} className={`${NOTE_CLASS} focus-visible:bg-muted/40`}>
              {pauseNotice(view.pools, fallbackModelName)}
            </p>
          )}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Spinner size="sm" />
              <span>Checking free models…</span>
            </div>
          )}
          {quota.status === 'error' && (
            <button
              type="button"
              {...PICKER_ROW}
              className={`${ACTIVE_ROW_CLASS} min-h-11 text-sm text-foreground`}
              onClick={quota.retry}
            >
              Retry loading free models
            </button>
          )}
          {experiential.status === 'error' && (
            <button
              type="button"
              {...PICKER_ROW}
              className={`${ACTIVE_ROW_CLASS} min-h-11 text-sm text-foreground`}
              onClick={experiential.retry}
            >
              Retry Experiential Labs free models
            </button>
          )}
        </div>
      )}
    </div>
  );
}
