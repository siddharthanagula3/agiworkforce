'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui/popover';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { BudgetTrackerDisplay } from '@/features/chat/components/Budget/BudgetTrackerDisplay';
import { StyleSelector } from './StyleSelector';
import { Switch } from '@shared/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@shared/ui/tooltip';
import { PROVIDER_DISPLAY, type ProviderId } from '@agiworkforce/types';
import { useBillingStore } from '@/stores/unified/auth';
import { isModelAllowedForTier } from '@/constants/llm';

/**
 * Returns a human-readable daily usage label for free-tier users.
 * null when there is nothing worth showing (paid tier, no limit set, or
 * usage is comfortably low).
 */
function useDailyUsageLabel(): string | null {
  const tier = useBillingStore((s) => s.subscription?.tier ?? 'free');
  const dailyUsage_cents = useBillingStore((s) => s.dailyUsage_cents);
  const dailyLimit_cents = useBillingStore((s) => s.dailyLimit_cents);

  if (tier !== 'free') return null;
  if (!dailyLimit_cents || dailyLimit_cents <= 0) return null;

  const pct = dailyUsage_cents / dailyLimit_cents;
  if (pct < 0.8) return null;

  const remainingCents = Math.max(0, dailyLimit_cents - dailyUsage_cents);
  if (remainingCents <= 0) return 'Daily limit reached';

  // Approximate remaining messages assuming ~$0.01 average cost per message
  const approxMessages = Math.floor(remainingCents / 1);
  if (approxMessages <= 5) {
    return `~${approxMessages} message${approxMessages !== 1 ? 's' : ''} left today`;
  }
  return 'Approaching daily limit';
}

/**
 * Map a model-store providerKey (from models.json) to a ProviderId
 * as defined in PROVIDER_DISPLAY. Most keys are 1:1; managed_cloud
 * maps to agi-cloud.
 */
function toProviderId(providerKey: string): ProviderId | null {
  if (providerKey === 'managed_cloud') return 'agi-cloud';
  if (providerKey in PROVIDER_DISPLAY) return providerKey as ProviderId;
  return null;
}

/** Returns the /providers/<id>.svg URL or null when provider is unknown. */
function providerLogoUrl(providerKey: string): string | null {
  const id = toProviderId(providerKey);
  if (!id) return null;
  return `/providers/${id}.svg`;
}

/** Returns the brand hex color for a provider key. */
function providerBrandHex(providerKey: string): string {
  const id = toProviderId(providerKey);
  return id ? (PROVIDER_DISPLAY[id].brandColor ?? '#71717A') : '#71717A';
}

/** Whether this provider supports thinking/effort toggle. */
function providerSupportsEffort(providerKey: string): boolean {
  const id = toProviderId(providerKey);
  return id ? PROVIDER_DISPLAY[id].supportsEffort : false;
}

/** Whether this model supports adaptive thinking (checks provider capability). */
function modelSupportsThinking(model: AIModel): boolean {
  return providerSupportsEffort(model.providerKey);
}

/** True when the model name contains "Opus" — used to show usage-rate tooltip. */
function isOpusModel(model: AIModel): boolean {
  return model.name.toLowerCase().includes('opus');
}

/**
 * Partition models into "recommended" (top ~4 for the user's tier) and
 * "more" (the rest). Flagship (locked) models always appear in recommended
 * with an isLocked flag so free users see them with an inline Upgrade link.
 *
 * When a search query is present we skip partitioning so the user sees all
 * matching results in a flat list.
 */
function partitionModels(
  models: AIModel[],
  tier: string,
  searchQuery: string,
): { recommended: (AIModel & { isLocked: boolean })[]; more: AIModel[]; isSearching: boolean } {
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const matches = models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q),
    );
    return {
      recommended: matches.map((m) => ({
        ...m,
        isLocked: m.providerKey !== 'managed_cloud' && !isModelAllowedForTier(m.id, tier),
      })),
      more: [],
      isSearching: true,
    };
  }

  const autoModels = models.filter((m) => m.providerKey === 'managed_cloud');
  const manualModels = models.filter((m) => m.providerKey !== 'managed_cloud');

  const inTierManual = manualModels.filter((m) => isModelAllowedForTier(m.id, tier));
  const lockedManual = manualModels.filter((m) => !isModelAllowedForTier(m.id, tier));

  // Always surface the Opus model in recommended so free users see the Anthropic flagship upsell.
  // Show up to 2 locked flagships: the first locked model in provider order, plus the Opus model
  // if it isn't already included. Fill remaining slots with in-tier models.
  const opusModel = lockedManual.find((m) => m.name.toLowerCase().includes('opus'));
  const firstLocked = lockedManual.slice(0, 1);
  const flagshipLocked =
    opusModel && !firstLocked.some((m) => m.id === opusModel.id)
      ? [...firstLocked, opusModel]
      : firstLocked;
  const remainingSlots = Math.max(0, 3 - flagshipLocked.length);
  const inTierSlice = inTierManual.slice(0, remainingSlots);
  const recommendedManual = [...flagshipLocked, ...inTierSlice];

  const recommendedIds = new Set([
    ...autoModels.map((m) => m.id),
    ...recommendedManual.map((m) => m.id),
  ]);
  const more = manualModels.filter((m) => !recommendedIds.has(m.id));

  const recommended = [
    ...autoModels.map((m) => ({ ...m, isLocked: false })),
    ...recommendedManual.map((m) => ({
      ...m,
      isLocked: !isModelAllowedForTier(m.id, tier),
    })),
  ];

  return { recommended, more, isSearching: false };
}

/** Provider logo: img when SVG exists, brand-color dot as fallback. */
function ProviderLogo({ providerKey, size = 14 }: { providerKey: string; size?: number }) {
  const logoUrl = providerLogoUrl(providerKey);
  const hex = providerBrandHex(providerKey);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-sm object-contain"
        onError={(e) => {
          // Fallback: hide image; parent still has brand-color dot as sibling
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, background: hex, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}

/** Renders a single model row. Locked rows show an inline "Upgrade" text link instead of an amber pill. */
function ModelRow({
  model,
  isSelected,
  isLocked,
  onSelect,
}: {
  model: AIModel;
  isSelected: boolean;
  isLocked: boolean;
  onSelect?: () => void;
}) {
  const rowContent = (
    <div
      className={[
        'flex items-center gap-2 rounded px-3 py-1.5 transition-colors',
        isLocked ? 'cursor-default' : 'cursor-pointer hover:bg-muted/60',
        isSelected ? 'bg-muted/40' : '',
      ].join(' ')}
      onClick={isLocked ? undefined : onSelect}
      role={isLocked ? undefined : 'button'}
      tabIndex={isLocked ? -1 : 0}
      onKeyDown={
        isLocked
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect?.();
            }
      }
    >
      <ProviderLogo providerKey={model.providerKey} size={14} />
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block truncate text-sm',
            isSelected ? 'font-medium text-foreground' : 'text-foreground/80',
          ].join(' ')}
        >
          {model.name}
        </span>
        {model.description && (
          <span className="block truncate text-xs text-muted-foreground">{model.description}</span>
        )}
      </span>
      {isLocked && (
        <a
          href="/pricing"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto shrink-0 text-xs text-amber-400 hover:text-amber-300 hover:underline"
          aria-label="Upgrade to unlock this model"
        >
          Upgrade
        </a>
      )}
      {isSelected && !isLocked && (
        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      )}
    </div>
  );

  if (isOpusModel(model)) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{rowContent}</div>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Opus consumes usage limits faster than other models
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return rowContent;
}

interface ComposerFooterProps {
  hint?: string;
  showModelSelector?: boolean;
  /** When true, shows a search input inside the model dropdown (code surface only). */
  showModelSearch?: boolean;
}

export function ComposerFooter({
  hint = 'Cmd+Enter to send · Enter for newline',
  showModelSelector = true,
  showModelSearch = false,
}: ComposerFooterProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabled);
  const setThinkingEnabled = useModelStore((s) => s.setThinkingEnabled);
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';

  const selectedModel = getSelectedModel();
  const dailyUsageLabel = useDailyUsageLabel();

  // Partition into recommended / more, respecting current tier and search
  const { recommended, more, isSearching } = partitionModels(AVAILABLE_MODELS, tier, searchQuery);

  // Auto-expand "More models" section when the selected model lives there
  const selectedInMore = more.some((m) => m.id === selectedModelId);
  const showMore = moreExpanded || selectedInMore || isSearching;

  const selectedProviderKey = selectedModel.providerKey;
  const supportsAdaptive = modelSupportsThinking(selectedModel);

  return (
    <div className="mt-2 space-y-2">
      {/* Budget display — renders only when tokens have been used */}
      <BudgetTrackerDisplay className="mx-1" />

      {/* Daily usage label — shown only for free tier when approaching limit */}
      {dailyUsageLabel && (
        <div className="flex items-center gap-1.5 px-1">
          <span
            className={[
              'text-xs font-medium',
              dailyUsageLabel === 'Daily limit reached' ? 'text-rose-400' : 'text-amber-400',
            ].join(' ')}
          >
            {dailyUsageLabel}
          </span>
          {dailyUsageLabel === 'Daily limit reached' && (
            <a
              href="/pricing"
              className="text-xs text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Upgrade
            </a>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        {/* Left: keyboard hint */}
        <span className="text-xs text-muted-foreground">{hint}</span>

        <div className="flex items-center gap-2">
          {/* Response style selector */}
          <StyleSelector />

          {/* Model selector */}
          {showModelSelector && (
            <Popover
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) {
                  setSearchQuery('');
                  setMoreExpanded(false);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  id="model-selector"
                  className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  aria-label="Change model"
                >
                  <ProviderLogo providerKey={selectedProviderKey} size={12} />
                  <span className="max-w-[140px] truncate">{selectedModel.name}</span>
                  {supportsAdaptive && (
                    <span className="text-xs text-muted-foreground/70">Adaptive</span>
                  )}
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
                {/* Header — model count badge removed per Claude reference */}
                <div className="flex items-center border-b border-border/40 px-3 py-2">
                  <span className="text-xs font-medium text-foreground">Models</span>
                </div>

                {/* Search input — shown only in code surface */}
                {showModelSearch && (
                  <div className="border-b border-border/40 px-3 py-1.5">
                    <input
                      className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                      placeholder="Search models..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Search models"
                    />
                  </div>
                )}

                <div className="max-h-[320px] overflow-y-auto py-1">
                  {/* Recommended section label */}
                  {!isSearching && (
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      Recommended
                    </div>
                  )}
                  {recommended.map((model) => {
                    const isSelected = model.id === selectedModelId;
                    return (
                      <ModelRow
                        key={model.id}
                        model={model}
                        isSelected={isSelected}
                        isLocked={model.isLocked}
                        onSelect={
                          model.isLocked
                            ? undefined
                            : () => {
                                setSelectedModelId(model.id);
                                setOpen(false);
                              }
                        }
                      />
                    );
                  })}

                  {/* Adaptive thinking toggle row — sits between model list and "More models" */}
                  {!isSearching && (
                    <>
                      <div className="my-1 border-t border-border/40" />
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-foreground/80">
                            Adaptive thinking
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Thinks for more complex tasks
                          </span>
                        </span>
                        <Switch
                          checked={thinkingEnabled}
                          onCheckedChange={(checked) => setThinkingEnabled(checked)}
                          aria-label="Toggle adaptive thinking"
                          className="h-5 w-9"
                        />
                      </div>
                    </>
                  )}

                  {/* More models section — only shown when not searching */}
                  {!isSearching && more.length > 0 && (
                    <>
                      <div className="my-1 border-t border-border/40" />
                      <button
                        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => setMoreExpanded((v) => !v)}
                        aria-expanded={showMore}
                      >
                        <ChevronRight
                          className={[
                            'h-3 w-3 shrink-0 transition-transform',
                            showMore ? 'rotate-90' : '',
                          ].join(' ')}
                          aria-hidden="true"
                        />
                        More models
                        <span className="ml-auto rounded bg-muted/50 px-1 text-[10px]">
                          {more.length}
                        </span>
                      </button>
                      {showMore &&
                        more.map((model) => {
                          const locked = !isModelAllowedForTier(model.id, tier);
                          const isSelected = model.id === selectedModelId;
                          return (
                            <ModelRow
                              key={model.id}
                              model={model}
                              isSelected={isSelected}
                              isLocked={locked}
                              onSelect={
                                locked
                                  ? undefined
                                  : () => {
                                      setSelectedModelId(model.id);
                                      setOpen(false);
                                    }
                              }
                            />
                          );
                        })}
                    </>
                  )}

                  {recommended.length === 0 && isSearching && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No models match
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
