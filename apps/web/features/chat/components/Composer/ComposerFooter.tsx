'use client';

import { useState } from 'react';
import { ChevronDown, Brain, Lock, ChevronRight } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui/popover';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { BudgetTrackerDisplay } from '@/features/chat/components/Budget/BudgetTrackerDisplay';
import { StyleSelector } from './StyleSelector';
import { PROVIDER_DISPLAY, EFFORT_LABEL, type ProviderId, type Effort } from '@agiworkforce/types';
import { MARKETING } from '@/lib/marketing-constants';
import { useBillingStore } from '@/stores/unified/auth';
import { isModelAllowedForTier } from '@/constants/llm';

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

/**
 * Partition models into "recommended" (top ~4 for the user's tier, in-tier
 * models first with auto-modes at the top) and "more" (the rest).
 *
 * When a search query is present we skip partitioning so the user sees all
 * matching results in a flat list.
 */
function partitionModels(
  models: AIModel[],
  tier: string,
  searchQuery: string,
): { recommended: AIModel[]; more: AIModel[]; isSearching: boolean } {
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const matches = models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q),
    );
    return { recommended: matches, more: [], isSearching: true };
  }

  const inTier = models.filter(
    (m) => m.providerKey === 'managed_cloud' || isModelAllowedForTier(m.id, tier),
  );
  const outOfTier = models.filter(
    (m) => m.providerKey !== 'managed_cloud' && !isModelAllowedForTier(m.id, tier),
  );

  // Top recommended: auto-modes first (managed_cloud), then up to 3 in-tier manual models
  const autoModels = inTier.filter((m) => m.providerKey === 'managed_cloud');
  const manualInTier = inTier.filter((m) => m.providerKey !== 'managed_cloud');
  const recommended = [...autoModels, ...manualInTier.slice(0, 3)];
  const more = [...manualInTier.slice(3), ...outOfTier];

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

/** Renders a single model row in the selector. Locked rows show an Upgrade badge linking to /pricing. */
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
  return (
    <div
      className={[
        'flex items-center gap-2 rounded px-3 py-1.5 transition-colors',
        isLocked ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-muted/60',
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
          className="ml-auto flex shrink-0 items-center gap-0.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 hover:bg-amber-400/25"
          aria-label="Upgrade to unlock this model"
        >
          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
          Upgrade
        </a>
      )}
      {isSelected && !isLocked && (
        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </div>
  );
}

const EFFORT_ORDER: Effort[] = ['low', 'medium', 'high', 'max'];

interface ComposerFooterProps {
  hint?: string;
  showModelSelector?: boolean;
}

export function ComposerFooter({
  hint = 'Cmd+Enter to send · Enter for newline',
  showModelSelector = true,
}: ComposerFooterProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabled);
  const setThinkingEnabled = useModelStore((s) => s.setThinkingEnabled);
  const thinkingBudget = useModelStore((s) => s.thinkingBudget);
  const setThinkingBudget = useModelStore((s) => s.setThinkingBudget);
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';

  const selectedModel = getSelectedModel();

  // Partition into recommended / more, respecting current tier and search
  const { recommended, more, isSearching } = partitionModels(AVAILABLE_MODELS, tier, searchQuery);

  // Auto-expand "More models" section when the selected model lives there
  const selectedInMore = more.some((m) => m.id === selectedModelId);
  const showMore = moreExpanded || selectedInMore || isSearching;

  const selectedProviderKey = selectedModel.providerKey;
  const supportsEffort = providerSupportsEffort(selectedProviderKey);

  // Current effort derived from thinkingBudget
  function currentEffort(): Effort {
    if (thinkingBudget >= 65536) return 'max';
    if (thinkingBudget >= 32768) return 'high';
    if (thinkingBudget >= 16384) return 'medium';
    return 'low';
  }

  function selectEffort(effort: Effort) {
    const budgetMap: Record<Effort, number> = {
      low: 4096,
      medium: 16384,
      high: 32768,
      max: 65536,
    };
    setThinkingBudget(budgetMap[effort]);
    setThinkingEnabled(true);
  }

  return (
    <div className="mt-2 space-y-2">
      {/* Budget display — renders only when tokens have been used */}
      <BudgetTrackerDisplay className="mx-1" />

      <div className="flex items-center justify-between gap-2 px-1">
        {/* Left: keyboard hint */}
        <span className="text-xs text-muted-foreground">{hint}</span>

        <div className="flex items-center gap-2">
          {/* Thinking effort selector — only for providers that support it */}
          {supportsEffort && thinkingEnabled && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-amber-400 transition-colors hover:bg-muted/60"
                  aria-label="Thinking effort"
                >
                  <Brain className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{EFFORT_LABEL[currentEffort()]}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-40 p-1">
                <div className="space-y-0.5">
                  {EFFORT_ORDER.map((effort) => (
                    <button
                      key={effort}
                      onClick={() => selectEffort(effort)}
                      className={[
                        'w-full rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted',
                        currentEffort() === effort
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {EFFORT_LABEL[effort]}
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => setThinkingEnabled(false)}
                    className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Off
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Thinking enable button — shown when provider supports effort but it's off */}
          {supportsEffort && !thinkingEnabled && (
            <button
              onClick={() => {
                selectEffort('medium');
              }}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-amber-400"
              aria-label="Enable thinking"
            >
              <Brain className="h-3 w-3 shrink-0" aria-hidden="true" />
            </button>
          )}

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
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
                <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
                  <span className="text-xs font-medium text-foreground">Models</span>
                  <span className="ml-auto rounded bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
                    {MARKETING.providers.display} providers
                  </span>
                </div>
                {/* Search input */}
                <div className="border-b border-border/40 px-3 py-1.5">
                  <input
                    className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search models"
                  />
                </div>
                <div className="max-h-[320px] overflow-y-auto py-1">
                  {/* Recommended section */}
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
                        isLocked={false}
                        onSelect={() => {
                          setSelectedModelId(model.id);
                          setOpen(false);
                        }}
                      />
                    );
                  })}

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
