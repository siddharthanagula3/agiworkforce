'use client';

import { Check, Scale, Star } from '@agiworkforce/icons';
import { ProviderLogo } from '@features/chat/components/Composer/ProviderLogo';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { entryCapabilities } from '../lib/model-filters';
import {
  accessLabel,
  creditsPerMillionLabel,
  isSelectable,
  modelSummary,
  retirementLabel,
  statusLabel,
  tokenCeilingLabel,
} from '../lib/model-presentation';

const CHIP_CLASS =
  'rounded-full border border-[var(--chat-border)] px-2 py-0.5 text-xs text-muted-foreground';
const META_LABEL_CLASS = 'text-xs text-muted-foreground';
const META_VALUE_CLASS = 'text-sm text-foreground';
const ICON_BUTTON_CLASS =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:bg-muted pointer-coarse:min-h-11 pointer-coarse:min-w-11';

export interface ModelCardProps {
  entry: ModelCatalogueEntry;
  planLabel: string;
  isFavourite: boolean;
  isCompared: boolean;
  canCompare: boolean;
  onToggleFavourite: (modelId: string) => void;
  onToggleCompare: (modelId: string) => void;
  onTry: (modelId: string) => void;
}

export function ModelCard({
  entry,
  planLabel,
  isFavourite,
  isCompared,
  canCompare,
  onToggleFavourite,
  onToggleCompare,
  onTry,
}: ModelCardProps) {
  const capabilities = entryCapabilities(entry);
  const summary = modelSummary(entry);
  const status = statusLabel(entry);
  const retirement = retirementLabel(entry);
  const selectable = isSelectable(entry);

  return (
    <article
      data-testid="model-card"
      data-model-id={entry.id}
      className="flex flex-col gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4"
    >
      <div className="flex items-start gap-2.5">
        <ProviderLogo providerKey={entry.developer} size={20} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium break-words text-foreground">{entry.displayName}</h2>
          <p className={META_LABEL_CLASS}>{entry.developerLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggleFavourite(entry.id)}
          aria-pressed={isFavourite}
          aria-label={
            isFavourite
              ? `Remove ${entry.displayName} from favourites`
              : `Add ${entry.displayName} to favourites`
          }
          className={ICON_BUTTON_CLASS}
        >
          <Star className={['h-4 w-4', isFavourite ? 'text-primary' : ''].join(' ')} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onToggleCompare(entry.id)}
          aria-pressed={isCompared}
          disabled={!isCompared && !canCompare}
          aria-label={
            isCompared
              ? `Remove ${entry.displayName} from the comparison`
              : `Compare ${entry.displayName}`
          }
          className={[
            ICON_BUTTON_CLASS,
            isCompared ? 'bg-muted text-foreground' : '',
            !isCompared && !canCompare ? 'cursor-not-allowed opacity-45' : '',
          ].join(' ')}
        >
          {isCompared ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Scale className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <p className="font-mono text-xs text-muted-foreground">{entry.id}</p>

      {summary ? <p className="text-sm text-muted-foreground">{summary}</p> : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <dt className={META_LABEL_CLASS}>Context</dt>
          <dd className={META_VALUE_CLASS}>{tokenCeilingLabel(entry.contextTokens)}</dd>
        </div>
        <div>
          <dt className={META_LABEL_CLASS}>Max output</dt>
          <dd className={META_VALUE_CLASS}>{tokenCeilingLabel(entry.maxOutputTokens)}</dd>
        </div>
        <div>
          <dt className={META_LABEL_CLASS}>Input per million</dt>
          <dd className={META_VALUE_CLASS}>{creditsPerMillionLabel(entry.inputPerMillion)}</dd>
        </div>
        <div>
          <dt className={META_LABEL_CLASS}>Output per million</dt>
          <dd className={META_VALUE_CLASS}>{creditsPerMillionLabel(entry.outputPerMillion)}</dd>
        </div>
      </dl>

      {capabilities.length > 0 || entry.openWeight ? (
        <ul className="flex flex-wrap gap-1">
          {capabilities.map((capability) => (
            <li key={capability.capability} className={CHIP_CLASS}>
              {capability.label}
            </li>
          ))}
          {entry.openWeight ? <li className={CHIP_CLASS}>Open weight</li> : null}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!selectable}
          onClick={() => onTry(entry.id)}
          className={[
            'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11',
            selectable
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          ].join(' ')}
        >
          Try model
        </button>
        <span className="text-xs text-muted-foreground">{accessLabel(entry, planLabel)}</span>
        {retirement ? (
          <span
            data-testid="model-retirement"
            className="rounded-full border border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] px-2 py-0.5 text-xs text-[var(--chat-warning-fg)]"
          >
            {retirement}
          </span>
        ) : null}
        {status ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>
    </article>
  );
}
