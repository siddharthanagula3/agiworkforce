'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronLeft, CircleHelp, Lock, Star } from '@agiworkforce/icons';
import { PROVIDER_LABELS } from '@shared/config/llm';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import type { ModelCatalogueProvider } from '@features/chat/lib/use-model-catalogue';
import { ProviderLogo } from './ProviderLogo';

const FAVOURITES_RAIL_KEY = 'favourites';
const FAVOURITES_RAIL_LABEL = 'Favourites';
const NEW_TAG_WINDOW_DAYS = 30;
const NEW_TAG_LABEL = 'New';
const ROUTER_TAG_LABEL = 'Router';
const OPEN_WEIGHT_CHIP_LABEL = 'Open weight';
const CATALOGUE_SEARCH_LABEL = 'Search models';
const CATALOGUE_BACK_LABEL = 'Back to the short list';
const MODEL_CARD_BACK_LABEL = 'Back to the model list';
const EMPTY_LIST_TEXT = 'No models match';
const NOT_PUBLISHED_TEXT = 'Not published';

const COMING_SOON_TAG_LABEL = 'Coming soon';
const ENVIRONMENT_TAG_LABEL = 'Beta';

const RAIL_CLASS =
  'flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--chat-border)] p-1';
const RAIL_ROW_CLASS =
  'flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-visible:outline-none';
const ROW_CLASS =
  'flex h-12 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-left transition-colors focus-visible:outline-none';
const ROW_NAME_CLASS = 'block truncate text-sm leading-5';
const ROW_GUIDANCE_CLASS = 'block truncate text-xs leading-4 text-muted-foreground';
const TAG_CLASS = 'shrink-0 rounded-full px-1.5 py-px text-xs font-medium';
const CHIP_ROW_CLASS = 'flex flex-wrap gap-1 border-b border-[var(--chat-border)] px-2 py-1.5';
const CHIP_CLASS =
  'rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none';
const CARD_LABEL_CLASS = 'text-xs text-muted-foreground';
const CARD_VALUE_CLASS = 'text-sm text-foreground';

type CapabilityChipKey = 'vision' | 'reasoning' | 'tools' | 'imageOut' | 'videoOut' | 'audio';

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
    key: 'audio',
    label: 'Audio',
    matches: (entry) =>
      entry.capabilities.audioInput === true || entry.capabilities.audioOutput === true,
  },
];

function providerLabel(providerKey: string): string {
  return PROVIDER_LABELS[providerKey] ?? providerKey;
}

function isNewRelease(entry: ModelCatalogueEntry, now: number): boolean {
  if (!entry.releasedOn) return false;
  const releasedAt = Date.parse(entry.releasedOn);
  if (Number.isNaN(releasedAt)) return false;
  const days = (now - releasedAt) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= NEW_TAG_WINDOW_DAYS;
}

function formatReleasedOn(releasedOn: string | null): string {
  if (!releasedOn) return NOT_PUBLISHED_TEXT;
  const releasedAt = Date.parse(releasedOn);
  if (Number.isNaN(releasedAt)) return NOT_PUBLISHED_TEXT;
  return new Date(releasedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTokens(tokens: number | null): string {
  if (tokens === null || tokens <= 0) return NOT_PUBLISHED_TEXT;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
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

function ModelCard({ entry, onBack }: { entry: ModelCatalogueEntry; onBack: () => void }) {
  const capabilities = CAPABILITY_CHIPS.filter((chip) => chip.matches(entry));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex h-7 w-fit items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/60"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {MODEL_CARD_BACK_LABEL}
      </button>

      <div className="flex items-center gap-2.5">
        <ProviderLogo providerKey={entry.provider} size={20} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{entry.displayName}</p>
          <p className={CARD_LABEL_CLASS}>{providerLabel(entry.provider)}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <dt className={CARD_LABEL_CLASS}>Family</dt>
          <dd className={CARD_VALUE_CLASS}>{entry.family ?? 'None'}</dd>
        </div>
        <div>
          <dt className={CARD_LABEL_CLASS}>Price band</dt>
          <dd className="flex h-5 items-center">
            {entry.priceBand ? (
              <span className="flex items-center gap-1.5">
                <PriceBandMark filled={entry.priceBand.filled} scale={entry.priceBand.scale} />
                <span className={CARD_VALUE_CLASS}>
                  {`${entry.priceBand.filled} of ${entry.priceBand.scale}`}
                </span>
              </span>
            ) : (
              <span className={CARD_VALUE_CLASS}>{NOT_PUBLISHED_TEXT}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className={CARD_LABEL_CLASS}>Context ceiling</dt>
          <dd className={CARD_VALUE_CLASS}>{formatTokens(entry.contextTokens)}</dd>
        </div>
        <div>
          <dt className={CARD_LABEL_CLASS}>Output ceiling</dt>
          <dd className={CARD_VALUE_CLASS}>{formatTokens(entry.maxOutputTokens)}</dd>
        </div>
        <div>
          <dt className={CARD_LABEL_CLASS}>Lifecycle stage</dt>
          <dd className={CARD_VALUE_CLASS}>{entry.stage ?? NOT_PUBLISHED_TEXT}</dd>
        </div>
        <div>
          <dt className={CARD_LABEL_CLASS}>Released</dt>
          <dd className={CARD_VALUE_CLASS}>{formatReleasedOn(entry.releasedOn)}</dd>
        </div>
      </dl>

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

      {!entry.admitted && entry.minimumPlanLabel && (
        <p className="mt-3 text-xs text-primary">{`${entry.minimumPlanLabel} and above`}</p>
      )}
    </div>
  );
}

export interface ModelCatalogueProps {
  entries: readonly ModelCatalogueEntry[];
  providers: readonly ModelCatalogueProvider[];
  favouriteModelIds: readonly string[];
  selectedModelId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (modelId: string) => void;
  onToggleFavourite: (modelId: string) => void;
  onUpgradeRequest?: () => void;
  onBack: () => void;
  initialProviderKey?: string;
  isEnvironmentLocked: (requiresEnvironment: string) => { locked: boolean; reason?: string };
}

export function ModelCatalogue({
  entries,
  providers,
  favouriteModelIds,
  selectedModelId,
  query,
  onQueryChange,
  onSelect,
  onToggleFavourite,
  onUpgradeRequest,
  onBack,
  initialProviderKey,
  isEnvironmentLocked,
}: ModelCatalogueProps) {
  const favourites = useMemo(() => new Set(favouriteModelIds), [favouriteModelIds]);
  const [chosenRailKey, setChosenRailKey] = useState<string | null>(initialProviderKey ?? null);
  const railKey = chosenRailKey ?? providers[0]?.key ?? FAVOURITES_RAIL_KEY;
  const [activeChips, setActiveChips] = useState<ReadonlySet<CapabilityChipKey>>(new Set());
  const [openWeightOnly, setOpenWeightOnly] = useState(false);
  const [cardModelId, setCardModelId] = useState<string | null>(null);
  const now = Date.now();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (railKey === FAVOURITES_RAIL_KEY) {
        if (!favourites.has(entry.id)) return false;
      } else if (!needle && entry.provider !== railKey) return false;
      if (needle) {
        const haystack = `${entry.displayName} ${providerLabel(entry.provider)} ${entry.family ?? ''}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      if (openWeightOnly && !entry.openWeight) return false;
      for (const key of activeChips) {
        const chip = CAPABILITY_CHIPS.find((candidate) => candidate.key === key);
        if (chip && !chip.matches(entry)) return false;
      }
      return true;
    });
  }, [activeChips, entries, favourites, openWeightOnly, query, railKey]);

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
    ...providers.map((provider) => ({
      key: provider.key,
      label: providerLabel(provider.key),
      count: provider.admittedCount,
    })),
  ];

  if (cardEntry) {
    return <ModelCard entry={cardEntry} onBack={() => setCardModelId(null)} />;
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
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
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

      <div className="flex min-h-0 flex-1">
        <div role="tablist" aria-label="Model providers" className={RAIL_CLASS}>
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
                    : 'text-foreground/80 hover:bg-muted/50',
                ].join(' ')}
              >
                {entry.key === FAVOURITES_RAIL_KEY ? (
                  <Star className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ProviderLogo providerKey={entry.key} size={14} />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{entry.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className={CHIP_ROW_CLASS}>
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
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {EMPTY_LIST_TEXT}
              </p>
            ) : (
              visible.map((entry) => {
                const isSelected = entry.id === selectedModelId;
                const isFavourite = favourites.has(entry.id);
                const comingSoon = entry.availability !== 'live';
                const environment = entry.requiresEnvironment
                  ? isEnvironmentLocked(entry.requiresEnvironment)
                  : { locked: false };
                const planLocked = !entry.admitted;
                const hardLocked = comingSoon || environment.locked;
                const locked = planLocked || hardLocked;
                return (
                  <div key={entry.id} className="flex items-center gap-0">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={hardLocked}
                      title={comingSoon ? COMING_SOON_TAG_LABEL : environment.reason}
                      aria-label={
                        comingSoon
                          ? `${entry.displayName} - ${COMING_SOON_TAG_LABEL}`
                          : environment.locked
                            ? `${entry.displayName} - ${environment.reason ?? ENVIRONMENT_TAG_LABEL}`
                            : planLocked && entry.minimumPlanLabel
                              ? `${entry.displayName} - ${entry.minimumPlanLabel} and above`
                              : entry.displayName
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
                      <ProviderLogo providerKey={entry.provider} size={16} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={[
                            ROW_NAME_CLASS,
                            isSelected ? 'font-medium text-foreground' : 'text-foreground/85',
                          ].join(' ')}
                        >
                          {entry.displayName}
                        </span>
                        <span className={ROW_GUIDANCE_CLASS}>{providerLabel(entry.provider)}</span>
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        {isNewRelease(entry, now) && (
                          <span
                            className={`${TAG_CLASS} bg-[var(--chat-info)]/15 text-[var(--chat-info)]`}
                          >
                            {NEW_TAG_LABEL}
                          </span>
                        )}
                        {entry.isRouter && (
                          <span className={`${TAG_CLASS} bg-muted/60 text-muted-foreground`}>
                            {ROUTER_TAG_LABEL}
                          </span>
                        )}
                        {entry.priceBand && (
                          <PriceBandMark
                            filled={entry.priceBand.filled}
                            scale={entry.priceBand.scale}
                          />
                        )}
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
                        {!hardLocked && planLocked && entry.minimumPlanLabel && (
                          <span
                            className={`${TAG_CLASS} whitespace-nowrap bg-primary/10 text-primary`}
                          >
                            <Lock
                              className="mr-0.5 inline h-2.5 w-2.5 align-[-0.1em]"
                              aria-hidden="true"
                            />
                            {`${entry.minimumPlanLabel} and above`}
                          </span>
                        )}
                        {isSelected && !locked && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
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
                        className={['h-3.5 w-3.5', isFavourite ? 'text-primary' : ''].join(' ')}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardModelId(entry.id)}
                      aria-label={`About ${entry.displayName}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/60"
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
