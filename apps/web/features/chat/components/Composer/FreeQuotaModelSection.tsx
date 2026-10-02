'use client';

import { useId, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import {
  getProviderOffering,
  providerOfferingLabel,
  type ProviderOfferingLabel,
} from '@agiworkforce/types';
import {
  FREE_QUOTA_CATEGORIES,
  FREE_QUOTA_STATUS_LABELS,
} from '@/features/models/lib/free-quota-types';
import type {
  FreeModelSource,
  FreeModelSources,
} from '@features/chat/hooks/use-free-model-sources';
import {
  presentFreeModels,
  type FreeModelEntry,
  type FreeModelPool,
} from '@features/chat/lib/free-model-presentation';
import {
  freeQuotaSelection,
  isExperientialFreeOffering,
} from '@features/chat/lib/free-quota-selection';

const PICKER_ROW = { 'data-picker-row': '' };
const FOCUS_RING_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)]';
const ROW_CLASS = `flex min-h-12 w-full shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-start transition-colors ${FOCUS_RING_CLASS}`;
const ACTIVE_ROW_CLASS = `${ROW_CLASS} hover:bg-muted/60 focus-visible:bg-muted/60`;
const MUTED_ROW_CLASS = `${ROW_CLASS} cursor-default`;
const NAME_CLASS = 'block truncate text-sm leading-5';
const GUIDANCE_CLASS = 'block truncate text-xs leading-4 text-muted-foreground';
const POOL_HEADING_CLASS = 'px-3 pb-1 pt-3 text-xs font-medium text-foreground';
const SUBHEADING_CLASS = 'px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground';
const NOTE_CLASS = 'px-3 py-2 text-xs leading-5 text-muted-foreground';
const PROMOTIONAL_DATA_USE =
  'These models get only your messages, not your instructions or memory: their providers have not said they keep prompts out of training.';
const CALENDAR_DAY: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
};

type PendingAvailability = 'loading' | 'error' | 'unlisted';

const PENDING_REASONS: Record<PendingAvailability, string> = {
  loading: 'Checking availability…',
  error: 'Availability could not be checked',
  unlisted: FREE_QUOTA_STATUS_LABELS.unavailable,
};

interface PendingSelection {
  label: ProviderOfferingLabel;
  availability: PendingAvailability;
  fallbackModelName: string | null;
}

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

function calendarDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleDateString(undefined, CALENDAR_DAY);
}

function readyGuidance(entry: FreeModelEntry, promotional: boolean): string {
  if (promotional) return 'Free promotion · text chat · provider quota applies';
  const { model, label } = entry;
  const use = getProviderOffering(model.key)?.quotaChatImageInput
    ? 'image chat'
    : FREE_QUOTA_CATEGORIES[model.category].toLowerCase();
  const allocation = model.expiresOn
    ? `expires ${calendarDay(model.expiresOn)}`
    : 'limited allocation';
  return [label.version, 'Free quota', use, allocation].filter(Boolean).join(' · ');
}

function withVersion(label: ProviderOfferingLabel, reason: string): string {
  return [label.version, reason].filter(Boolean).join(' · ');
}

function unavailableReason(entry: FreeModelEntry): string {
  const { status, expiresOn } = entry.model;
  const reason = FREE_QUOTA_STATUS_LABELS[status];
  return withVersion(
    entry.label,
    status === 'expired' && expiresOn ? `${reason} ${calendarDay(expiresOn)}` : reason,
  );
}

function nextStepAfter(fallbackModelName: string | null): string {
  return fallbackModelName
    ? `Choose ${fallbackModelName} or another free model.`
    : 'Choose another free model.';
}

function pendingAvailability(
  source: FreeModelSource,
  selectedId: string,
): PendingAvailability | null {
  if (source.catalogue) {
    return source.catalogue.models.some((model) => model.key === selectedId) ? null : 'unlisted';
  }
  return source.status === 'loading' || source.status === 'error' ? source.status : 'unlisted';
}

function pendingExplanation({ label, availability, fallbackModelName }: PendingSelection): string {
  if (availability === 'loading') {
    return `${label.displayName} stays selected while its availability is checked.`;
  }
  if (availability === 'error') {
    return `${label.displayName} could not be checked. Retry, or choose ${fallbackModelName ?? 'another free model'}.`;
  }
  return `${label.displayName} is not available right now. ${nextStepAfter(fallbackModelName)}`;
}

function unavailableExplanation(entry: FreeModelEntry, fallbackModelName: string | null): string {
  const { issuer, model, label } = entry;
  const nextStep = nextStepAfter(fallbackModelName);
  if (model.status === 'exhausted') {
    return `${issuer}'s free allowance for ${label.displayName} is used up. It is the provider's allowance, not a limit on your account. ${nextStep}`;
  }
  if (model.status === 'expired') {
    return `${issuer}'s free offer for ${label.displayName} ended${model.expiresOn ? ` on ${calendarDay(model.expiresOn)}` : ''}. ${nextStep}`;
  }
  return `${label.displayName} from ${issuer} is not available right now. ${nextStep}`;
}

function pauseNotice(
  pools: readonly FreeModelPool[],
  fallbackModelName: string | null,
  settled: boolean,
): string {
  const paused = pools.filter((pool) => pool.pause === 'paused').map((pool) => pool.issuer);
  const usedUp = pools.filter((pool) => pool.pause === 'used_up').map((pool) => pool.issuer);
  if (settled && pools.every((pool) => pool.pause)) {
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
  label,
  reason,
  selected,
  explanation,
  onExplain,
}: {
  label: ProviderOfferingLabel;
  reason: string;
  selected: boolean;
  explanation: string | null;
  onExplain: () => void;
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
        aria-label={label.displayName}
        aria-describedby={explanation ? `${reasonId} ${explanationId}` : reasonId}
        onClick={onExplain}
        className={MUTED_ROW_CLASS}
      >
        <span className="min-w-0 flex-1">
          <span className={`${NAME_CLASS} text-muted-foreground`}>{label.name}</span>
          <span id={reasonId} className={GUIDANCE_CLASS}>
            {reason}
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

function PoolHeading({ issuer, promotional }: { issuer: string; promotional: boolean }) {
  if (!promotional) return <p className={POOL_HEADING_CLASS}>{issuer}</p>;
  return (
    <>
      <p className={POOL_HEADING_CLASS}>{`${issuer} · Free`}</p>
      <p className="px-3 text-xs leading-5 text-muted-foreground">{PROMOTIONAL_DATA_USE}</p>
      <a
        {...PICKER_ROW}
        href="/privacy"
        className={`flex min-h-6 w-fit items-center rounded-md px-3 text-xs text-muted-foreground underline pointer-coarse:min-h-11 pointer-coarse:w-full ${FOCUS_RING_CLASS}`}
      >
        Data use
      </a>
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
  const settled = !loading && quota.status !== 'error' && experiential.status !== 'error';
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
  const selection = freeQuotaSelection(selectedId);
  const selectionSource = isExperientialFreeOffering(selectedId) ? experiential : quota;
  const selectionLabel = selection ? providerOfferingLabel(selectedId) : null;
  const selectionAvailability = selection ? pendingAvailability(selectionSource, selectedId) : null;
  const pending: PendingSelection | null =
    selection && selectionLabel && selectionAvailability
      ? {
          label: selectionLabel,
          availability: selectionAvailability,
          fallbackModelName: selection.category === 'chat' ? fallbackModelName : null,
        }
      : null;

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
        label={entry.label}
        reason={unavailableReason(entry)}
        selected={entry.model.key === selectedId}
        explanation={
          explainedId === entry.model.key
            ? unavailableExplanation(
                entry,
                entry.model.category === 'chat' ? fallbackModelName : null,
              )
            : null
        }
        onExplain={() => setExplainedId(entry.model.key)}
      />
    );

  return (
    <div className="border-b border-[var(--chat-border)]">
      <button
        type="button"
        {...PICKER_ROW}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:bg-muted/60 ${FOCUS_RING_CLASS}`}
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
                className="h-9 w-full rounded-md border border-[var(--chat-border)] bg-background px-2 text-sm text-foreground pointer-coarse:min-h-11"
              >
                {view.categories.map((key) => (
                  <option key={key} value={key}>
                    {FREE_QUOTA_CATEGORIES[key]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {pending && (
            <UnavailableRow
              label={pending.label}
              reason={withVersion(pending.label, PENDING_REASONS[pending.availability])}
              selected
              explanation={explainedId === selectedId ? pendingExplanation(pending) : null}
              onExplain={() => setExplainedId(selectedId)}
            />
          )}
          {view.pinned && renderEntry(view.pinned)}
          {listedPools.map((pool) => (
            <div key={pool.issuer} role="group" aria-label={`${pool.issuer} free models`}>
              {pool.issuer === promotionalIssuer && (
                <PoolHeading issuer={pool.issuer} promotional />
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
                      className="h-9 w-full rounded-md border border-[var(--chat-border)] bg-transparent px-2 text-sm text-foreground pointer-coarse:min-h-11"
                    />
                  </div>
                  {more.map((group) => (
                    <div
                      key={group.issuer}
                      role="group"
                      aria-label={`More ${group.issuer} free models`}
                    >
                      {(groupedByIssuer || group.issuer === promotionalIssuer) && (
                        <PoolHeading
                          issuer={group.issuer}
                          promotional={group.issuer === promotionalIssuer}
                        />
                      )}
                      {lineRuns(group.entries).map((line) => (
                        <div key={line[0]!.model.key}>
                          <p className={SUBHEADING_CLASS}>{line[0]!.label.line}</p>
                          {line.map(renderEntry)}
                        </div>
                      ))}
                    </div>
                  ))}
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
                      {groupedByIssuer && <PoolHeading issuer={pool.issuer} promotional={false} />}
                      {pool.unavailable.map(renderEntry)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {pausedPools.length > 0 && (
            <p
              {...PICKER_ROW}
              tabIndex={-1}
              className={`${NOTE_CLASS} rounded-md ${FOCUS_RING_CLASS}`}
            >
              {pauseNotice(view.pools, fallbackModelName, settled)}
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
