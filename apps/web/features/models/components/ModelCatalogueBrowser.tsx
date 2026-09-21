'use client';

import { useMemo, useState } from 'react';
import { Search, Sparkles } from '@agiworkforce/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@agiworkforce/ui';
import type { AutoRoutingProfileView } from '@agiworkforce/types';
import type { ModelPickerFilterCapability } from '@agiworkforce/unified-chat/model-picker';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import type {
  ModelCatalogueDeveloper,
  ModelCatalogueStatus,
} from '@features/chat/lib/use-model-catalogue';
import {
  EMPTY_MODEL_FILTERS,
  MODEL_ACCESS_FILTERS,
  MODEL_CAPABILITY_FILTERS,
  MODEL_COLLECTIONS,
  filterCatalogueEntries,
  type ModelAccess,
  type ModelCollection,
} from '../lib/model-filters';
import { ModelCard } from './ModelCard';
import { ModelCompareTable } from './ModelCompareTable';

const COMPARE_LIMIT = 3;
const COMPARE_MINIMUM = 2;

const CHIP_CLASS =
  'rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';
const CHIP_ACTIVE_CLASS = 'border-primary bg-primary/10 text-primary';
const CHIP_IDLE_CLASS = 'border-[var(--chat-border)] text-muted-foreground hover:text-foreground';
const GROUP_LABEL_CLASS = 'text-xs text-muted-foreground';
const FILTER_GROUP_CLASS =
  'flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-x-visible sm:pb-0';

function chipClass(active: boolean): string {
  return [CHIP_CLASS, active ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS].join(' ');
}

export interface ModelCatalogueBrowserProps {
  entries: readonly ModelCatalogueEntry[];
  developers: readonly ModelCatalogueDeveloper[];
  planLabel: string;
  status: ModelCatalogueStatus;
  autoProfile: AutoRoutingProfileView;
  favouriteModelIds: readonly string[];
  recentModelIds: readonly string[];
  onRetry: () => void;
  onToggleFavourite: (modelId: string) => void;
  onTry: (modelId: string) => void;
}

export function ModelCatalogueBrowser({
  entries,
  developers,
  planLabel,
  status,
  autoProfile,
  favouriteModelIds,
  recentModelIds,
  onRetry,
  onToggleFavourite,
  onTry,
}: ModelCatalogueBrowserProps) {
  const [query, setQuery] = useState('');
  const [developer, setDeveloper] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ReadonlySet<ModelPickerFilterCapability>>(
    EMPTY_MODEL_FILTERS.capabilities,
  );
  const [collection, setCollection] = useState<ModelCollection>('all');
  const [access, setAccess] = useState<ModelAccess>('all');
  const [comparedIds, setComparedIds] = useState<readonly string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const visible = useMemo(
    () =>
      filterCatalogueEntries(
        entries,
        { query, developer, capabilities, collection, access },
        { favouriteModelIds, recentModelIds },
      ),
    [
      access,
      capabilities,
      collection,
      developer,
      entries,
      favouriteModelIds,
      query,
      recentModelIds,
    ],
  );

  const comparedEntries = comparedIds.flatMap((id) => {
    const entry = entries.find((candidate) => candidate.id === id);
    return entry ? [entry] : [];
  });

  const toggleCapability = (capability: ModelPickerFilterCapability) => {
    setCapabilities((previous) => {
      const next = new Set(previous);
      if (next.has(capability)) next.delete(capability);
      else next.add(capability);
      return next;
    });
  };

  const toggleCompare = (modelId: string) => {
    setComparedIds((previous) => {
      if (previous.includes(modelId)) return previous.filter((id) => id !== modelId);
      if (previous.length >= COMPARE_LIMIT) return previous;
      return [...previous, modelId];
    });
  };

  const favourites = new Set(favouriteModelIds);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-medium text-foreground">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {`${entries.length} models from ${developers.length} developers${planLabel ? ` on ${planLabel}` : ''}. Every model runs on interchangeable providers, so you choose the model, not the supplier.`}
        </p>
      </header>

      <section className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-foreground">{autoProfile.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{autoProfile.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onTry(autoProfile.id)}
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--chat-border)] px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
        >
          {`Try ${autoProfile.label}`}
        </button>
      </section>

      <div className="mt-5 flex h-10 items-center gap-2 rounded-lg border border-[var(--chat-border)] px-3 focus-within:ring-2 focus-within:ring-[var(--chat-focus-ring)]">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          name="model-search"
          autoComplete="off"
          aria-label="Search models"
          placeholder="Search models"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div role="group" aria-label="Model developers" className={FILTER_GROUP_CLASS}>
          <button
            type="button"
            aria-pressed={developer === null}
            onClick={() => setDeveloper(null)}
            className={`${chipClass(developer === null)} shrink-0`}
          >
            {`All developers (${entries.length})`}
          </button>
          {developers.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={developer === option.key}
              onClick={() => setDeveloper(developer === option.key ? null : option.key)}
              className={`${chipClass(developer === option.key)} shrink-0`}
            >
              {`${option.label} (${option.totalCount})`}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Capabilities" className={FILTER_GROUP_CLASS}>
          {MODEL_CAPABILITY_FILTERS.map((filter) => (
            <button
              key={filter.capability}
              type="button"
              aria-pressed={capabilities.has(filter.capability)}
              onClick={() => toggleCapability(filter.capability)}
              className={`${chipClass(capabilities.has(filter.capability))} shrink-0`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={GROUP_LABEL_CLASS}>Show</span>
            <div role="group" aria-label="Model collection" className="flex flex-wrap gap-1.5">
              {MODEL_COLLECTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={collection === option.key}
                  onClick={() => setCollection(option.key)}
                  className={chipClass(collection === option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={GROUP_LABEL_CLASS}>Access</span>
            <div role="group" aria-label="Plan access" className="flex flex-wrap gap-1.5">
              {MODEL_ACCESS_FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={access === option.key}
                  onClick={() => setAccess(option.key)}
                  className={chipClass(access === option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p role="status" className="mt-4 text-xs text-muted-foreground">
        {`${visible.length} of ${entries.length} models`}
      </p>

      {status === 'error' && entries.length === 0 ? (
        <div role="alert" className="mt-6 flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">The model list could not be loaded.</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 items-center rounded-md border border-[var(--chat-border)] px-3 text-sm font-medium text-foreground hover:bg-muted pointer-coarse:min-h-11"
          >
            Try again
          </button>
        </div>
      ) : status !== 'ready' && entries.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span>Loading models…</span>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No models match these filters.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((entry) => (
            <ModelCard
              key={entry.id}
              entry={entry}
              planLabel={planLabel}
              isFavourite={favourites.has(entry.id)}
              isCompared={comparedIds.includes(entry.id)}
              canCompare={comparedIds.length < COMPARE_LIMIT}
              onToggleFavourite={onToggleFavourite}
              onToggleCompare={toggleCompare}
              onTry={onTry}
            />
          ))}
        </div>
      )}

      {comparedIds.length > 0 ? (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] p-3">
          <span className="text-sm text-foreground">
            {`${comparedIds.length} of ${COMPARE_LIMIT} selected to compare`}
          </span>
          <button
            type="button"
            disabled={comparedIds.length < COMPARE_MINIMUM}
            onClick={() => setCompareOpen(true)}
            className={[
              'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11',
              comparedIds.length < COMPARE_MINIMUM
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            ].join(' ')}
          >
            Compare
          </button>
          <button
            type="button"
            onClick={() => setComparedIds([])}
            className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11"
          >
            Clear
          </button>
        </div>
      ) : null}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare models</DialogTitle>
            <DialogDescription>Context, capabilities and plan access.</DialogDescription>
          </DialogHeader>
          <ModelCompareTable entries={comparedEntries} planLabel={planLabel} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
