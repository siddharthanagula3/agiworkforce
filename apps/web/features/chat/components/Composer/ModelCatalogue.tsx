'use client';

import { useMemo, useState } from 'react';
import { translateUiPlural } from '@agiworkforce/ui';
import { Check, ChevronLeft, CircleHelp, Lock, Star } from '@agiworkforce/icons';
import {
  MODEL_PICKER_RELEASE_STAGE_LABEL,
  resolveModelLineLabel,
  resolveModelReleaseStage,
} from '@agiworkforce/unified-chat/model-picker';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import type { ModelCatalogueDeveloper } from '@features/chat/lib/use-model-catalogue';
import {
  TYPICAL_MESSAGE_TOKENS,
  creditsPerMillionTokens,
  estimateMessageCredits,
} from '@/lib/billing/credit-estimates';
import { ProviderLogo } from './ProviderLogo';

const FAVOURITES_RAIL_KEY = 'favourites';
const FAVOURITES_RAIL_LABEL = 'Favourites';
const RECENTS_RAIL_KEY = 'recents';
const RECENTS_RAIL_LABEL = 'Recent';
const NEW_TAG_WINDOW_DAYS = 30;
const NEW_TAG_LABEL = 'New';
const ROUTER_TAG_LABEL = 'Router';
const OPEN_WEIGHT_CHIP_LABEL = 'Open weight';
const CATALOGUE_SEARCH_LABEL = 'Search models';
const CATALOGUE_BACK_LABEL = 'Back to the short list';
const MODEL_CARD_BACK_LABEL = 'Back to the model list';
const EMPTY_LIST_TEXT = 'No models match';
const LOADING_TEXT = 'Loading models…';
const LOAD_FAILED_TEXT = 'The model list could not be loaded.';
const RETRY_LABEL = 'Try again';

const COMING_SOON_TAG_LABEL = 'Coming soon';
const ENVIRONMENT_TAG_LABEL = 'Beta';
const RAIL_LABEL = 'Model developers';
const CHIP_GROUP_LABEL = 'Filter by capability';
const UNAVAILABLE_TEXT = 'Temporarily unavailable';
const NOT_OFFERED_TEXT = 'Not available in this app';
const EVENT_TAG_LABEL = 'Free during event';
const FREE_POOL_TAG_LABEL = 'Free';
const FREE_POOL_COST_TEXT = 'Free, uses no credits';
const TYPICAL_MESSAGE_NOTE = `A typical message is about ${TYPICAL_MESSAGE_TOKENS.input.toLocaleString()} tokens in and ${TYPICAL_MESSAGE_TOKENS.output.toLocaleString()} out.`;

const RAIL_CLASS =
  'flex w-full shrink-0 flex-row gap-0.5 overflow-x-auto border-b border-[var(--chat-border)] p-1 sm:w-40 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-e';
const RAIL_ROW_CLASS =
  'flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 text-start text-sm transition-colors focus-visible:outline-none sm:w-full sm:whitespace-normal';
const ROW_CLASS =
  'flex h-12 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-start transition-colors focus-visible:outline-none';
const ROW_NAME_CLASS = 'block truncate text-sm leading-5';
const ROW_GUIDANCE_CLASS = 'block truncate text-xs leading-4 text-muted-foreground';
const TAG_CLASS = 'shrink-0 rounded-full px-1.5 py-px text-xs font-medium';
const CHIP_ROW_CLASS = 'flex flex-wrap gap-1 border-b border-[var(--chat-border)] px-2 py-1.5';
const CHIP_CLASS =
  'rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none';
const CARD_LABEL_CLASS = 'text-xs text-muted-foreground';
const CARD_VALUE_CLASS = 'text-sm text-foreground';

interface ModelLineGroup {
  key: string;
  label: string;
  entries: ModelCatalogueEntry[];
}

function releasedAtMs(entry: ModelCatalogueEntry): number {
  const releasedAt = entry.releasedOn ? Date.parse(entry.releasedOn) : Number.NaN;
  return Number.isNaN(releasedAt) ? Number.NEGATIVE_INFINITY : releasedAt;
}

function newestFirst(left: ModelCatalogueEntry, right: ModelCatalogueEntry): number {
  return (
    releasedAtMs(right) - releasedAtMs(left) || left.displayName.localeCompare(right.displayName)
  );
}

function groupByModelLine(entries: readonly ModelCatalogueEntry[]): ModelLineGroup[] {
  const labels = new Map(
    entries.map((entry) => [entry.id, resolveModelLineLabel(entry.displayName)] as const),
  );
  const lineKeys = new Set([...labels.values()].map((label) => label.toLowerCase()));
  const groups = new Map<string, ModelLineGroup>();
  for (const entry of [...entries].sort(newestFirst)) {
    const label = labels.get(entry.id) ?? entry.displayName;
    const lower = label.toLowerCase();
    const developerPrefix = `${(entry.developerLabel ?? '').toLowerCase()} `;
    const unprefixed = lower.startsWith(developerPrefix)
      ? lower.slice(developerPrefix.length)
      : null;
    const key = unprefixed && lineKeys.has(unprefixed) ? unprefixed : lower;
    const group = groups.get(key);
    if (group) {
      group.entries.push(entry);
    } else {
      groups.set(key, {
        key,
        label: key === lower ? label : label.slice(developerPrefix.length),
        entries: [entry],
      });
    }
  }
  return [...groups.values()];
}

function releaseStageLabel(entry: ModelCatalogueEntry): string | null {
  const stage = resolveModelReleaseStage(entry.id, entry.displayName);
  return stage ? MODEL_PICKER_RELEASE_STAGE_LABEL[stage] : null;
}

type CapabilityChipKey =
  | 'vision'
  | 'reasoning'
  | 'tools'
  | 'search'
  | 'codeExecution'
  | 'imageOut'
  | 'videoOut'
  | 'audioIn'
  | 'audioOut';

const CAPABILITY_CHIPS: readonly {
  key: CapabilityChipKey;
  label: string;
  matches: (entry: ModelCatalogueEntry) => boolean;
}[] = [
  { key: 'vision', label: 'Vision', matches: (entry) => entry.capabilities.imageInput === true },
  {
    key: 'reasoning',
    label: 'Reasoning',
    matches: (entry) => entry.capabilities.reasoning === true,
  },
  { key: 'tools', label: 'Tools', matches: (entry) => entry.capabilities.functionCalling === true },
  { key: 'search', label: 'Search', matches: (entry) => entry.capabilities.webSearch === true },
  {
    key: 'codeExecution',
    label: 'Code execution',
    matches: (entry) => entry.capabilities.codeExecution === true,
  },
  {
    key: 'imageOut',
    label: 'Image out',
    matches: (entry) => entry.capabilities.imageOutput === true,
  },
  {
    key: 'videoOut',
    label: 'Video out',
    matches: (entry) => entry.capabilities.videoOutput === true,
  },
  {
    key: 'audioIn',
    label: 'Audio in',
    matches: (entry) => entry.capabilities.audioInput === true,
  },
  {
    key: 'audioOut',
    label: 'Audio out',
    matches: (entry) => entry.capabilities.audioOutput === true,
  },
];

function isNewRelease(entry: ModelCatalogueEntry, now: number): boolean {
  if (!entry.releasedOn) return false;
  const releasedAt = Date.parse(entry.releasedOn);
  if (Number.isNaN(releasedAt)) return false;
  const days = (now - releasedAt) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= NEW_TAG_WINDOW_DAYS;
}

function formatReleasedOn(releasedOn: string | null): string | null {
  if (!releasedOn) return null;
  const releasedAt = Date.parse(releasedOn);
  if (Number.isNaN(releasedAt)) return null;
  return new Date(releasedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTokens(tokens: number | null): string | null {
  if (tokens === null || tokens <= 0) return null;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

function formatMessageCredits(credits: number): string {
  const amount = credits.toLocaleString(undefined, {
    maximumFractionDigits: credits < 10 ? 2 : 0,
  });
  return translateUiPlural(
    'chat',
    'counts.approxCredits',
    credits,
    { one: '~{{amount}} credit', other: '~{{amount}} credits' },
    { amount },
  );
}

function freePoolCostLabel(entry: ModelCatalogueEntry): string | null {
  return entry.freePool && !entry.eventAccess ? FREE_POOL_COST_TEXT.toLowerCase() : null;
}

function PriceBandMark({ filled, scale }: { filled: number; scale: number }) {
  return (
    <span
      role="img"
      aria-label={`Price band ${filled} of ${scale}`}
      className="flex shrink-0 items-end gap-px"
    >
      {Array.from({ length: scale }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={[
            'w-0.5 rounded-sm',
            index < filled ? 'bg-foreground/45' : 'bg-muted-foreground/25',
          ].join(' ')}
          style={{ height: `${(index + 1) * 2 + 2}px` }}
        />
      ))}
    </span>
  );
}

function ModelCard({
  entry,
  lineLabel,
  onBack,
}: {
  entry: ModelCatalogueEntry;
  lineLabel: string;
  onBack: () => void;
}) {
  const capabilities = CAPABILITY_CHIPS.filter((chip) => chip.matches(entry));
  const showsCreditFigures = !entry.freePool && !entry.eventAccess;
  const messageCredits = showsCreditFigures ? estimateMessageCredits(entry.id) : null;
  const rates = showsCreditFigures ? creditsPerMillionTokens(entry.id) : null;
  const priceFact = (published: string | null): string | null => {
    if (entry.eventAccess) return null;
    return entry.freePool ? FREE_POOL_COST_TEXT : published;
  };
  const facts = [
    { label: 'Family', value: lineLabel },
    {
      label: 'Typical message',
      value: priceFact(messageCredits === null ? null : formatMessageCredits(messageCredits)),
    },
    {
      label: 'Credits per 1M tokens',
      value: priceFact(
        rates ? `${rates.input.toLocaleString()} in · ${rates.output.toLocaleString()} out` : null,
      ),
    },
    { label: 'Context ceiling', value: formatTokens(entry.contextTokens) },
    { label: 'Output ceiling', value: formatTokens(entry.maxOutputTokens) },
    { label: 'Released', value: formatReleasedOn(entry.releasedOn) },
  ].filter((fact): fact is { label: string; value: string } => fact.value !== null);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex h-7 w-fit items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/60"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {MODEL_CARD_BACK_LABEL}
      </button>

      <div className="flex items-center gap-2.5">
        <ProviderLogo providerKey={entry.developer} size={20} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{entry.displayName}</p>
          <p className={CARD_LABEL_CLASS}>{entry.developerLabel}</p>
        </div>
      </div>

      <dl className={facts.length > 1 ? 'mt-3 grid grid-cols-2 gap-x-3 gap-y-2' : 'mt-3'}>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className={CARD_LABEL_CLASS}>{fact.label}</dt>
            <dd className={CARD_VALUE_CLASS}>{fact.value}</dd>
          </div>
        ))}
      </dl>

      {messageCredits !== null ? (
        <p className={`${CARD_LABEL_CLASS} mt-2`}>{TYPICAL_MESSAGE_NOTE}</p>
      ) : null}

      <p className={`${CARD_LABEL_CLASS} mt-3`}>Capabilities</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {capabilities.length > 0 ? (
          capabilities.map((chip) => (
            <span
              key={chip.key}
              className={`${CHIP_CLASS} border-[var(--chat-border)] text-muted-foreground`}
            >
              {chip.label}
            </span>
          ))
        ) : (
          <span className={CARD_VALUE_CLASS}>Text only</span>
        )}
        {entry.openWeight && (
          <span className={`${CHIP_CLASS} border-[var(--chat-border)] text-muted-foreground`}>
            {OPEN_WEIGHT_CHIP_LABEL}
          </span>
        )}
      </div>

      {entry.temporarilyUnavailable && (
        <p className="mt-3 text-xs text-muted-foreground">{UNAVAILABLE_TEXT}</p>
      )}

      {!entry.admitted && entry.minimumPlanLabel && (
        <p className="mt-3 text-xs text-primary">{`Upgrade to use · ${entry.minimumPlanLabel}`}</p>
      )}
    </div>
  );
}

export interface ModelCatalogueProps {
  entries: readonly ModelCatalogueEntry[];
  developers: readonly ModelCatalogueDeveloper[];
  status?: 'idle' | 'loading' | 'ready' | 'error';
  onRetry?: () => void;
  favouriteModelIds: readonly string[];
  recentModelIds: readonly string[];
  selectedModelId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (modelId: string) => void;
  onToggleFavourite: (modelId: string) => void;
  onUpgradeRequest?: () => void;
  onBack: () => void;
  initialDeveloperKey?: string;
  isEnvironmentLocked: (requiresEnvironment: string) => { locked: boolean; reason?: string };
  isSelectable?: (modelId: string) => boolean;
}

export function ModelCatalogue({
  entries,
  developers,
  status = 'ready',
  onRetry,
  favouriteModelIds,
  recentModelIds,
  selectedModelId,
  query,
  onQueryChange,
  onSelect,
  onToggleFavourite,
  onUpgradeRequest,
  onBack,
  initialDeveloperKey,
  isEnvironmentLocked,
  isSelectable,
}: ModelCatalogueProps) {
  const favourites = useMemo(() => new Set(favouriteModelIds), [favouriteModelIds]);
  const recentRank = useMemo(
    () => new Map(recentModelIds.map((id, index) => [id, index])),
    [recentModelIds],
  );
  const [chosenRailKey, setChosenRailKey] = useState<string | null>(initialDeveloperKey ?? null);
  const railKey = chosenRailKey ?? developers[0]?.key ?? FAVOURITES_RAIL_KEY;
  const [activeChips, setActiveChips] = useState<ReadonlySet<CapabilityChipKey>>(new Set());
  const [openWeightOnly, setOpenWeightOnly] = useState(false);
  const [cardModelId, setCardModelId] = useState<string | null>(null);
  const now = Date.now();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = entries.filter((entry) => {
      if (railKey === FAVOURITES_RAIL_KEY) {
        if (!favourites.has(entry.id)) return false;
      } else if (railKey === RECENTS_RAIL_KEY) {
        if (!recentRank.has(entry.id)) return false;
      } else if (!needle && entry.developer !== railKey) return false;
      if (needle) {
        const haystack = [entry.displayName, entry.developerLabel, entry.family ?? ''].join(' ');
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      if (openWeightOnly && !entry.openWeight) return false;
      for (const key of activeChips) {
        const chip = CAPABILITY_CHIPS.find((candidate) => candidate.key === key);
        if (chip && !chip.matches(entry)) return false;
      }
      return true;
    });
    if (railKey !== RECENTS_RAIL_KEY) return matched;
    return [...matched].sort(
      (left, right) => (recentRank.get(left.id) ?? 0) - (recentRank.get(right.id) ?? 0),
    );
  }, [activeChips, entries, favourites, openWeightOnly, query, railKey, recentRank]);

  const messageCredits = useMemo(
    () => new Map(entries.map((entry) => [entry.id, estimateMessageCredits(entry.id)])),
    [entries],
  );

  const lineGroups = useMemo(
    () =>
      railKey === FAVOURITES_RAIL_KEY || railKey === RECENTS_RAIL_KEY
        ? null
        : groupByModelLine(visible),
    [railKey, visible],
  );
  const lineLabelById = useMemo(
    () =>
      new Map(
        (lineGroups ?? []).flatMap((group) =>
          group.entries.map((entry) => [entry.id, group.label] as const),
        ),
      ),
    [lineGroups],
  );

  const cardEntry = cardModelId ? entries.find((entry) => entry.id === cardModelId) : undefined;

  const toggleChip = (key: CapabilityChipKey) => {
    setActiveChips((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const railEntries = [
    { key: FAVOURITES_RAIL_KEY, label: FAVOURITES_RAIL_LABEL, count: favourites.size },
    { key: RECENTS_RAIL_KEY, label: RECENTS_RAIL_LABEL, count: recentRank.size },
    ...developers.map((developer) => ({
      key: developer.key,
      label: developer.label,
      count: developer.admittedCount,
    })),
  ];

  const renderEntry = (entry: ModelCatalogueEntry) => {
    const isSelected = entry.id === selectedModelId;
    const isFavourite = favourites.has(entry.id);
    const comingSoon = entry.availability !== 'live';
    const environment = entry.requiresEnvironment
      ? isEnvironmentLocked(entry.requiresEnvironment)
      : { locked: false };
    const planLocked = !entry.admitted;
    const notOffered = isSelectable ? !isSelectable(entry.id) : false;
    const hardLocked =
      comingSoon || environment.locked || entry.temporarilyUnavailable || notOffered;
    const locked = planLocked || hardLocked;
    const pricedInCredits =
      !entry.eventAccess && !entry.freePool && (messageCredits.get(entry.id) ?? null) !== null;
    const costLabel = freePoolCostLabel(entry);
    const stageLabel = hardLocked ? null : releaseStageLabel(entry);
    return (
      <div key={entry.id} className="flex items-center gap-0">
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          disabled={hardLocked}
          title={
            comingSoon
              ? COMING_SOON_TAG_LABEL
              : entry.temporarilyUnavailable
                ? UNAVAILABLE_TEXT
                : notOffered
                  ? NOT_OFFERED_TEXT
                  : environment.reason
          }
          aria-label={
            comingSoon
              ? `${entry.displayName} - ${COMING_SOON_TAG_LABEL}`
              : entry.temporarilyUnavailable
                ? `${entry.displayName} - ${UNAVAILABLE_TEXT}`
                : environment.locked
                  ? `${entry.displayName} - ${environment.reason ?? ENVIRONMENT_TAG_LABEL}`
                  : notOffered
                    ? `${entry.displayName} - ${NOT_OFFERED_TEXT}`
                    : planLocked && entry.minimumPlanLabel
                      ? `${entry.displayName} - Upgrade to use, ${entry.minimumPlanLabel}`
                      : [entry.displayName, stageLabel, costLabel].filter(Boolean).join(', ')
          }
          onClick={() => {
            if (hardLocked) return;
            if (planLocked) onUpgradeRequest?.();
            else onSelect(entry.id);
          }}
          className={[
            ROW_CLASS,
            'min-w-0 flex-1',
            hardLocked
              ? 'cursor-not-allowed opacity-45'
              : planLocked
                ? 'cursor-pointer opacity-80 hover:bg-muted/40 hover:opacity-100'
                : 'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60',
          ].join(' ')}
        >
          <ProviderLogo providerKey={entry.developer} size={16} />
          <span className="min-w-0 flex-1">
            <span
              className={[
                ROW_NAME_CLASS,
                isSelected ? 'font-medium text-foreground' : 'font-normal text-foreground',
              ].join(' ')}
            >
              {entry.displayName}
            </span>
            <span className={ROW_GUIDANCE_CLASS}>{entry.developerLabel}</span>
          </span>
          <span className="ms-auto flex shrink-0 items-center gap-1.5">
            {isNewRelease(entry, now) && (
              <span
                className={`${TAG_CLASS} bg-[var(--chat-info)]/15 text-[var(--chat-info-text)]`}
              >
                {NEW_TAG_LABEL}
              </span>
            )}
            {entry.isRouter && (
              <span className={`${TAG_CLASS} bg-muted/60 text-muted-foreground`}>
                {ROUTER_TAG_LABEL}
              </span>
            )}
            {stageLabel && (
              <span className={`${TAG_CLASS} bg-muted/60 text-muted-foreground`}>{stageLabel}</span>
            )}
            {entry.freePool && !entry.eventAccess ? (
              <span className={`${TAG_CLASS} border border-[var(--chat-border)] text-success-text`}>
                {FREE_POOL_TAG_LABEL}
              </span>
            ) : !pricedInCredits && entry.priceBand && !entry.eventAccess && !entry.freePool ? (
              <PriceBandMark filled={entry.priceBand.filled} scale={entry.priceBand.scale} />
            ) : null}
            {comingSoon && (
              <span className={`${TAG_CLASS} bg-muted/50 text-muted-foreground`}>
                {COMING_SOON_TAG_LABEL}
              </span>
            )}
            {!comingSoon && environment.locked && (
              <span className={`${TAG_CLASS} bg-muted/60 text-muted-foreground`}>
                {ENVIRONMENT_TAG_LABEL}
              </span>
            )}
            {entry.eventAccess && !entry.temporarilyUnavailable && (
              <span
                className={`${TAG_CLASS} whitespace-nowrap bg-[var(--chat-info)]/15 text-[var(--chat-info-text)]`}
              >
                {EVENT_TAG_LABEL}
              </span>
            )}
            {entry.temporarilyUnavailable && (
              <span className={`${TAG_CLASS} whitespace-nowrap bg-muted/50 text-muted-foreground`}>
                {UNAVAILABLE_TEXT}
              </span>
            )}
            {notOffered && !comingSoon && !entry.temporarilyUnavailable && (
              <span className={`${TAG_CLASS} whitespace-nowrap bg-muted/50 text-muted-foreground`}>
                {NOT_OFFERED_TEXT}
              </span>
            )}
            {!hardLocked && planLocked && entry.minimumPlanLabel && (
              <span className={`${TAG_CLASS} whitespace-nowrap bg-primary/10 text-primary`}>
                <Lock className="me-0.5 inline h-4 w-4 align-[-0.1em]" aria-hidden="true" />
                {`Upgrade to use · ${entry.minimumPlanLabel}`}
              </span>
            )}
            {isSelected && !locked && (
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onToggleFavourite(entry.id)}
          aria-pressed={isFavourite}
          aria-label={
            isFavourite
              ? `Remove ${entry.displayName} from favourites`
              : `Add ${entry.displayName} to favourites`
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/60"
        >
          <Star
            className={['h-4 w-4', isFavourite ? 'text-primary' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => setCardModelId(entry.id)}
          aria-label={`About ${entry.displayName}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/60"
        >
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  if (cardEntry) {
    return (
      <ModelCard
        entry={cardEntry}
        lineLabel={lineLabelById.get(cardEntry.id) ?? resolveModelLineLabel(cardEntry.displayName)}
        onBack={() => setCardModelId(null)}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--chat-border)] px-2 py-1.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={CATALOGUE_BACK_LABEL}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/60"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          autoFocus
          className="chat-quiet-field h-7 w-full text-sm placeholder:text-muted-foreground"
          name="model-catalogue-search"
          autoComplete="off"
          placeholder="Search models"
          aria-label={CATALOGUE_SEARCH_LABEL}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div role="tablist" aria-label={RAIL_LABEL} className={RAIL_CLASS}>
          {railEntries.map((entry) => {
            const isActive = entry.key === railKey;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setChosenRailKey(entry.key)}
                className={[
                  RAIL_ROW_CLASS,
                  isActive
                    ? 'bg-muted/70 font-medium text-foreground'
                    : 'font-normal text-foreground hover:bg-muted/50',
                ].join(' ')}
              >
                {entry.key === FAVOURITES_RAIL_KEY ? (
                  <Star className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ProviderLogo providerKey={entry.key} size={16} />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{entry.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div role="group" aria-label={CHIP_GROUP_LABEL} className={CHIP_ROW_CLASS}>
            {CAPABILITY_CHIPS.map((chip) => {
              const isActive = activeChips.has(chip.key);
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => toggleChip(chip.key)}
                  className={[
                    CHIP_CLASS,
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-[var(--chat-border)] text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {chip.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={openWeightOnly}
              onClick={() => setOpenWeightOnly((value) => !value)}
              className={[
                CHIP_CLASS,
                openWeightOnly
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-[var(--chat-border)] text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {OPEN_WEIGHT_CHIP_LABEL}
            </button>
          </div>

          <div role="listbox" aria-label="Models" className="min-h-0 flex-1 overflow-y-auto p-1">
            {status === 'error' && entries.length === 0 ? (
              <div
                role="alert"
                className="flex flex-col items-center gap-2 px-3 py-4 text-center text-xs text-muted-foreground"
              >
                <span>{LOAD_FAILED_TEXT}</span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-md border border-[var(--chat-border)] px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/60 focus-visible:bg-muted/60"
                  >
                    {RETRY_LABEL}
                  </button>
                ) : null}
              </div>
            ) : status !== 'ready' && entries.length === 0 ? (
              <p role="status" className="px-3 py-4 text-center text-xs text-muted-foreground">
                {LOADING_TEXT}
              </p>
            ) : visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {EMPTY_LIST_TEXT}
              </p>
            ) : (
              (lineGroups?.flatMap((group) => group.entries) ?? visible).map(renderEntry)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
