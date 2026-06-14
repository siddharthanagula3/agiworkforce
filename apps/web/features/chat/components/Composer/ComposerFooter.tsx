'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui/popover';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { BudgetTrackerDisplay } from '@/features/chat/components/Budget/BudgetTrackerDisplay';
import { StyleSelector } from './StyleSelector';
import { Switch } from '@shared/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@shared/ui/tooltip';
import {
  EFFORT_LABEL,
  PROVIDER_DISPLAY,
  type Effort,
  type ProviderId,
  getPickerModelTier,
} from '@agiworkforce/types';
import { useBillingStore } from '@/stores/unified/auth';
import {
  getAllowedAutoModesForTier,
  getBestAutoModeForTier,
  getModelMetadata,
  isModelAllowedForTier,
} from '@/constants/llm';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { ProviderMark, hasProviderMark } from '@shared/components/ProviderMark';
import { AgiMark } from '@/components/agi/AgiMark';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { supportsOpenAIReasoningEffort } from '@agiworkforce/llm-normalize';

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
  const metadata = getModelMetadata(model.id);
  return metadata ? metadata.capabilities.thinking : providerSupportsEffort(model.providerKey);
}

function openAIModelSupportsXHigh(modelId: string): boolean {
  return supportsOpenAIReasoningEffort({ provider: 'openai', id: modelId }, 'xhigh');
}

function isModelSelectableForTier(model: AIModel, tier: string): boolean {
  // Free users may select any of the cost-efficient tool-capable trial models
  // (so they can experience the tool-calling UI); the 3-prompt cap covers the set.
  if (FREE_TRIAL_MODELS.includes(model.id)) return true;
  if (model.providerKey === 'managed_cloud') {
    return getAllowedAutoModesForTier(tier).includes(model.id);
  }
  if (tier === 'free' || tier === 'hobby') return false;
  return isModelAllowedForTier(model.id, tier);
}

/** True when the model name contains "Opus" · used to show usage-rate tooltip. */
function isOpusModel(model: AIModel): boolean {
  return model.name.toLowerCase().includes('opus');
}

const EFFORT_OPTIONS: ReadonlyArray<{ value: Effort; description: string }> = [
  { value: 'low', description: 'Fastest, lowest token use' },
  { value: 'medium', description: 'Balanced default for daily work' },
  { value: 'high', description: 'More thorough for complex work' },
  { value: 'xhigh', description: 'Extra-high for long-horizon work' },
  { value: 'max', description: 'Most capable, highest token use' },
];

function effortDisabledReason(model: AIModel, effort: Effort): string | null {
  const providerId = toProviderId(model.providerKey);
  if (!modelSupportsThinking(model)) return 'This model does not support effort control';
  if (providerId === 'openai' && effort === 'max') return 'OpenAI does not support Max effort';
  if (providerId === 'openai' && effort === 'xhigh' && !openAIModelSupportsXHigh(model.id)) {
    return 'This OpenAI model supports Low, Medium, and High effort';
  }
  if (providerId === 'google' && (effort === 'xhigh' || effort === 'max')) {
    return 'Gemini supports Low, Medium, and High effort';
  }
  if (providerId === 'agi-cloud' && (effort === 'xhigh' || effort === 'max')) {
    return 'Auto mode supports Low, Medium, and High effort';
  }
  return null;
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
        isLocked: !isModelSelectableForTier(m, tier),
      })),
      more: [],
      isSearching: true,
    };
  }

  // Top group = everything available in the user's tier (Auto modes first, then
  // manual models). Bottom ("More models") = everything that needs an upgrade,
  // Auto modes first there too. So free users see Auto (Economy) + their Hobby
  // models up top, and Auto Balanced/Best + flagships below with an Upgrade link.
  const isAuto = (m: AIModel) => m.providerKey === 'managed_cloud';
  const available = models.filter((m) => isModelSelectableForTier(m, tier));
  const locked = models.filter((m) => !isModelSelectableForTier(m, tier));

  const orderAutoFirst = (list: AIModel[]) => [
    ...list.filter(isAuto),
    ...list.filter((m) => !isAuto(m)),
  ];

  const recommended = orderAutoFirst(available).map((m) => ({ ...m, isLocked: false }));
  const more = orderAutoFirst(locked);

  return { recommended, more, isSearching: false };
}

/** Provider logo: AGI mark for Auto modes → official vector mark → local SVG → brand dot. */
function ProviderLogo({ providerKey, size = 14 }: { providerKey?: string; size?: number }) {
  // No resolved provider (e.g. a model without a provider) → render no logo
  // rather than crashing on providerKey.toLowerCase().
  if (!providerKey) return null;
  // Auto modes (managed cloud) carry the AGI brand mark in the brand accent colour.
  if (providerKey === 'managed_cloud') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-[var(--chat-accent-primary)]">
        <AgiMark size={size} mono />
      </span>
    );
  }

  // Prefer the official, theme-adaptive mark (OpenAI/Claude/Gemini/DeepSeek/etc.).
  const markKey = toProviderId(providerKey) ?? providerKey;
  if (hasProviderMark(markKey)) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-[var(--chat-text-secondary)]">
        <ProviderMark providerKey={markKey} size={size} />
      </span>
    );
  }

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

/**
 * Renders a single model row.
 * Locked rows are fully clickable and open the upgrade dialog; they show a
 * styled "Upgrade" badge so the affordance is obvious. Economy (free) rows
 * behave normally.
 */
function ModelRow({
  model,
  isSelected,
  isLocked,
  onSelect,
  onUpgradeRequest,
}: {
  model: AIModel;
  isSelected: boolean;
  isLocked: boolean;
  onSelect?: () => void;
  onUpgradeRequest?: () => void;
}) {
  // Derive which picker tier this model belongs to so we can label the badge
  // accurately (Balanced vs Premium) without hard-coding model IDs.
  const pickerTier = isLocked ? getPickerModelTier(model.id) : 'economy';

  const handleLockedClick = () => {
    onUpgradeRequest?.();
  };

  const rowContent = (
    <div
      className={[
        'flex items-center gap-2 rounded px-3 py-1.5 transition-colors',
        isLocked
          ? 'cursor-pointer hover:bg-muted/40 opacity-80 hover:opacity-100'
          : 'cursor-pointer hover:bg-muted/60',
        isSelected ? 'bg-muted/40' : '',
      ].join(' ')}
      onClick={isLocked ? handleLockedClick : onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isLocked) {
            handleLockedClick();
          } else {
            onSelect?.();
          }
        }
      }}
      aria-label={isLocked ? `${model.name} - requires upgrade` : model.name}
    >
      <ProviderLogo providerKey={model.providerKey} size={14} />
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block truncate text-sm',
            isLocked
              ? 'text-foreground/60'
              : isSelected
                ? 'font-medium text-foreground'
                : 'text-foreground/80',
          ].join(' ')}
        >
          {model.name}
        </span>
        {model.description && (
          <span className="block truncate text-xs text-muted-foreground">{model.description}</span>
        )}
      </span>
      {isLocked && (
        <span
          className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
          aria-label="Requires upgrade"
        >
          {pickerTier === 'premium' ? 'Pro' : 'Upgrade'}
        </span>
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
  onUpgradeRequest?: () => void;
  /** When true, render the selected model as a locked status pill instead of a dropdown. */
  lockModelSelector?: boolean;
  /** Controls whether the response style selector is visible. */
  showStyleSelector?: boolean;
  /** Free-trial prompt usage label, e.g. "2/3 prompts left". */
  trialUsageLabel?: string | null;
  /**
   * Inline mode: render ONLY the model/style selector cluster (no hint, budget,
   * or usage rows) so it can be dropped directly into the composer's control
   * row. Used by the empty-state composer to keep everything on one bottom row.
   */
  inline?: boolean;
  /** Extra classes applied to the outer element (e.g. flex order / ml-auto). */
  className?: string;
}

export function ComposerFooter({
  hint = 'Cmd+Enter to send · Enter for newline',
  showModelSelector = true,
  showModelSearch = false,
  onUpgradeRequest,
  lockModelSelector = false,
  showStyleSelector = true,
  trialUsageLabel,
  inline = false,
  className,
}: ComposerFooterProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const thinkingEnabled = useThinkingStore((s) => s.enabled);
  const thinkingEffort = useThinkingStore((s) => s.effort);
  const setThinkingEnabled = useThinkingStore((s) => s.setEnabled);
  const setThinkingEffort = useThinkingStore((s) => s.setEffort);
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';

  const selectedModel = getSelectedModel();
  const lockedDisplayModel =
    AVAILABLE_MODELS.find((model) => model.id === getBestAutoModeForTier('free')) ?? selectedModel;
  const dailyUsageLabel = useDailyUsageLabel();
  const usageLabel = trialUsageLabel ?? dailyUsageLabel;

  // Partition into recommended / more, respecting current tier and search
  const { recommended, more, isSearching } = partitionModels(AVAILABLE_MODELS, tier, searchQuery);

  // Auto-expand "More models" section when the selected model lives there
  const selectedInMore = more.some((m) => m.id === selectedModelId);
  const showMore = moreExpanded || selectedInMore || isSearching;

  const selectedProviderKey = (lockModelSelector ? lockedDisplayModel : selectedModel).providerKey;
  const supportsAdaptive = modelSupportsThinking(selectedModel);
  const currentEffortDisabledReason = effortDisabledReason(selectedModel, thinkingEffort);

  useEffect(() => {
    if (!isModelSelectableForTier(selectedModel, tier)) {
      setSelectedModelId(getBestAutoModeForTier(tier));
    }
  }, [selectedModel, setSelectedModelId, tier]);

  useEffect(() => {
    if (thinkingEnabled && currentEffortDisabledReason) {
      setThinkingEnabled(false);
    }
  }, [currentEffortDisabledReason, setThinkingEnabled, thinkingEnabled]);

  const handleThinkingEnabledChange = (checked: boolean) => {
    if (!checked) {
      setThinkingEnabled(false);
      return;
    }
    if (currentEffortDisabledReason) {
      setThinkingEffort('medium');
      setThinkingEnabled(true);
      return;
    }
    setThinkingEnabled(true);
  };

  return (
    <div
      className={[inline ? 'flex items-center' : 'mt-2 space-y-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {/* Budget display · renders only when tokens have been used */}
      {!inline && <BudgetTrackerDisplay className="mx-1" />}

      {/* Usage label · trial prompt count takes precedence over daily-cost hints. */}
      {!inline && usageLabel && (
        <div className="flex items-center gap-1.5 px-1">
          <span
            className={[
              'text-xs font-medium',
              usageLabel === 'Daily limit reached' ? 'text-rose-400' : 'text-amber-400',
            ].join(' ')}
          >
            {usageLabel}
          </span>
          {usageLabel === 'Daily limit reached' && (
            <button
              type="button"
              onClick={onUpgradeRequest}
              className="text-xs text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Upgrade
            </button>
          )}
        </div>
      )}

      <div
        className={
          inline ? 'flex items-center gap-2' : 'flex items-center justify-between gap-2 px-1'
        }
      >
        {/* Left: keyboard hint */}
        {!inline && <span className="text-xs text-muted-foreground">{hint}</span>}

        <div className="flex items-center gap-2">
          {/* Response style selector */}
          {showStyleSelector && <StyleSelector />}

          {/* Model selector */}
          {showModelSelector && lockModelSelector && (
            <button
              type="button"
              onClick={onUpgradeRequest}
              className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/35 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
              aria-label="Auto Economy is selected for the free web trial"
            >
              <ProviderLogo providerKey={selectedProviderKey} size={12} />
              <span className="max-w-[150px] truncate">{lockedDisplayModel.name}</span>
            </button>
          )}

          {showModelSelector && !lockModelSelector && (
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
                  {supportsAdaptive && thinkingEnabled && (
                    <span className="text-xs text-muted-foreground/70">
                      {EFFORT_LABEL[thinkingEffort]}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
                {/* Header · model count badge removed per Claude reference */}
                <div className="flex items-center border-b border-border/40 px-3 py-2">
                  <span className="text-xs font-medium text-foreground">Models</span>
                </div>

                {/* Search input · shown only in code surface */}
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
                      Available
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
                        onUpgradeRequest={onUpgradeRequest}
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

                  {/* Adaptive thinking toggle row · sits between model list and "More models" */}
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
                          checked={supportsAdaptive && thinkingEnabled}
                          disabled={!supportsAdaptive}
                          onCheckedChange={handleThinkingEnabledChange}
                          aria-label="Toggle adaptive thinking"
                          className="h-5 w-9"
                        />
                      </div>
                      {supportsAdaptive && thinkingEnabled && (
                        <div className="px-2 pb-1">
                          {EFFORT_OPTIONS.map((option) => {
                            const isActive = thinkingEffort === option.value;
                            const disabledReason = effortDisabledReason(
                              selectedModel,
                              option.value,
                            );
                            const isDisabled = Boolean(disabledReason);
                            return (
                              <button
                                key={option.value}
                                type="button"
                                disabled={isDisabled}
                                title={disabledReason ?? option.description}
                                onClick={() => setThinkingEffort(option.value)}
                                className={[
                                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                                  isDisabled
                                    ? 'cursor-not-allowed opacity-45'
                                    : isActive
                                      ? 'bg-muted/50'
                                      : 'hover:bg-muted/40',
                                ].join(' ')}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm text-foreground/85">
                                    {EFFORT_LABEL[option.value]}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {disabledReason ?? option.description}
                                  </span>
                                </span>
                                {isActive && (
                                  <Check
                                    className="h-3.5 w-3.5 shrink-0 text-primary"
                                    aria-hidden="true"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* More models section · only shown when not searching */}
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
                          const locked = !isModelSelectableForTier(model, tier);
                          const isSelected = model.id === selectedModelId;
                          return (
                            <ModelRow
                              key={model.id}
                              model={model}
                              isSelected={isSelected}
                              isLocked={locked}
                              onUpgradeRequest={onUpgradeRequest}
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
