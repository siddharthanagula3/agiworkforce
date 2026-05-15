'use client';

import { useState } from 'react';
import { ChevronDown, Brain } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui/popover';
import { Command, CommandList, CommandItem, CommandGroup, CommandInput } from '@shared/ui/command';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { BudgetTrackerDisplay } from '@/features/chat/components/Budget/BudgetTrackerDisplay';
import { StyleSelector } from './StyleSelector';
import { PROVIDER_DISPLAY, EFFORT_LABEL, type ProviderId, type Effort } from '@agiworkforce/types';
import { MARKETING } from '@/lib/marketing-constants';

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

function groupByProvider(models: AIModel[]): Record<string, AIModel[]> {
  return models.reduce<Record<string, AIModel[]>>((acc, model) => {
    if (!acc[model.providerKey]) acc[model.providerKey] = [];
    acc[model.providerKey]!.push(model);
    return acc;
  }, {});
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
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabled);
  const setThinkingEnabled = useModelStore((s) => s.setThinkingEnabled);
  const thinkingBudget = useModelStore((s) => s.thinkingBudget);
  const setThinkingBudget = useModelStore((s) => s.setThinkingBudget);

  const selectedModel = getSelectedModel();

  // Group models by providerKey (raw key from models.json, e.g. "anthropic", "managed_cloud")
  const grouped = groupByProvider(AVAILABLE_MODELS);

  // Derive display order: managed_cloud (auto modes) first, then remaining providers
  const providerOrder = Object.keys(grouped).sort((a, b) => {
    if (a === 'managed_cloud') return -1;
    if (b === 'managed_cloud') return 1;
    return 0;
  });

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
            <Popover open={open} onOpenChange={setOpen}>
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
                <Command>
                  <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
                    <span className="text-xs font-medium text-foreground">Models</span>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                      {MARKETING.providers.display} providers
                    </span>
                  </div>
                  <CommandInput placeholder="Search models..." className="h-9" />
                  <CommandList className="max-h-[320px]">
                    {providerOrder.map((providerKey) => {
                      const models = grouped[providerKey];
                      if (!models || models.length === 0) return null;
                      const id = toProviderId(providerKey);
                      const providerLabel = id
                        ? PROVIDER_DISPLAY[id].label
                        : (models[0]?.provider ?? providerKey);
                      const isAuto = providerKey === 'managed_cloud';

                      return (
                        <CommandGroup
                          key={providerKey}
                          heading={
                            <span className="flex items-center gap-1.5">
                              <ProviderLogo providerKey={providerKey} size={12} />
                              {isAuto ? 'Auto (Best)' : providerLabel}
                            </span>
                          }
                        >
                          {models.map((model) => {
                            const isSelected = model.id === selectedModelId;
                            return (
                              <CommandItem
                                key={model.id}
                                value={`${model.provider} ${model.name} ${model.id}`}
                                onSelect={() => {
                                  setSelectedModelId(model.id);
                                  setOpen(false);
                                }}
                                className="flex cursor-pointer items-center gap-2 py-1.5"
                              >
                                <span className="flex-1 min-w-0">
                                  <span
                                    className={[
                                      'block truncate text-sm',
                                      isSelected ? 'font-medium text-foreground' : '',
                                    ].join(' ')}
                                  >
                                    {model.name}
                                  </span>
                                  {model.description && (
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {model.description}
                                    </span>
                                  )}
                                </span>
                                {isSelected && (
                                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      );
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
