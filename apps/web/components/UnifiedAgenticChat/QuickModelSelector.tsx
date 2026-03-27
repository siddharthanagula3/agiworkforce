import { Brain, Check, Crown, DollarSign, Search, Sparkles, Wand2, X, Zap } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  getAllowedAutoModesForTier,
  canAccessManualModelSelection,
  getManagedCloudProviderIds,
  getManualOverrideModels,
  getModelMetadata,
  PROVIDER_LABELS,
  type ModelMetadata,
} from '@/constants/llm';
import { cn } from '@/lib/utils';
import { useModelStore } from '@shared/stores/model-store';
import { useUserProfileStore } from '@shared/stores/user-profile-store';

// ---- Types ----

export type QuickModelSelectorProps = {
  className?: string;
  onClose?: () => void;
};

// ---- Constants ----

const AUTO_ECONOMY_ID = 'auto-economy';
const AUTO_BALANCED_ID = 'auto-balanced';
const AUTO_PREMIUM_ID = 'auto-premium';

const AUTO_IDS = new Set([AUTO_ECONOMY_ID, AUTO_BALANCED_ID, AUTO_PREMIUM_ID]);

const AUTO_MODE_CONFIG: Record<
  string,
  {
    name: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  [AUTO_ECONOMY_ID]: {
    name: 'Auto (Economy)',
    description: 'Fastest, most cost-effective',
    icon: DollarSign,
  },
  [AUTO_BALANCED_ID]: {
    name: 'Auto (Balanced)',
    description: 'Quality/cost sweet spot',
    icon: Zap,
  },
  [AUTO_PREMIUM_ID]: {
    name: 'Auto (Premium)',
    description: 'Maximum performance',
    icon: Crown,
  },
};

const QUALITY_TIER_LABELS: Record<string, { text: string; className: string }> = {
  fast: { text: 'Fast', className: 'text-emerald-600 dark:text-emerald-400' },
  balanced: { text: 'Balanced', className: 'text-blue-600 dark:text-blue-400' },
  best: { text: 'Best', className: 'text-amber-600 dark:text-amber-400' },
};

const THINKING_BUDGET_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1K', value: 1024 },
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
];

// ---- Helpers ----

function getQualityLabel(tier: string | undefined): { text: string; className: string } {
  return QUALITY_TIER_LABELS[tier ?? ''] ?? { text: '', className: '' };
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

function formatPrice(perMillion: number): string {
  if (perMillion === 0) return 'Free';
  if (perMillion < 1) return `$${perMillion.toFixed(2)}`;
  return `$${perMillion.toFixed(0)}`;
}

// ---- Component ----

export const QuickModelSelector = ({ className, onClose }: QuickModelSelectorProps) => {
  const {
    selectedModelId,
    thinkingEnabled,
    thinkingBudget,
    lastRoutingDecision,
    setSelectedModelId,
    setThinkingBudget,
  } = useModelStore();
  const userPlan = useUserProfileStore((state) => state.user?.plan) ?? 'free';

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isAutoMode = AUTO_IDS.has(selectedModelId);
  const manualSelectionEnabled = useMemo(() => canAccessManualModelSelection(userPlan), [userPlan]);
  const visibleManagedProviders = useMemo(
    () => getManagedCloudProviderIds({ includeSearchProviders: false }),
    [],
  );
  const effectiveSearchQuery = manualSelectionEnabled ? searchQuery.toLowerCase().trim() : '';

  const availableAutoModes = useMemo(() => getAllowedAutoModesForTier(userPlan), [userPlan]);

  const modelGroups = useMemo(() => {
    const groups: Record<string, ModelMetadata[]> = {};
    if (!manualSelectionEnabled) {
      return groups;
    }

    for (const p of visibleManagedProviders) {
      groups[p] = [];
    }

    for (const model of getManualOverrideModels()) {
      if (model.modelType && !['chat', 'multimodal', 'reasoning'].includes(model.modelType)) {
        continue;
      }
      if (!visibleManagedProviders.includes(model.provider)) {
        continue;
      }

      if (effectiveSearchQuery) {
        const matchesName = model.name.toLowerCase().includes(effectiveSearchQuery);
        const matchesId = model.id.toLowerCase().includes(effectiveSearchQuery);
        const matchesProvider = model.provider.toLowerCase().includes(effectiveSearchQuery);
        const matchesBestFor = model.bestFor?.some((tag) =>
          tag.toLowerCase().includes(effectiveSearchQuery),
        );
        if (!matchesName && !matchesId && !matchesProvider && !matchesBestFor) continue;
      }

      groups[model.provider]?.push(model);
    }

    return groups;
  }, [effectiveSearchQuery, manualSelectionEnabled, visibleManagedProviders]);

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    onClose?.();
  };

  const handleAutoSelect = (modeId: string) => {
    setSelectedModelId(modeId);
    onClose?.();
  };

  const handleBudgetSelect = (budget: number) => {
    const meta = selectedModelId ? getModelMetadata(selectedModelId) : null;
    const supportsThinking = meta?.capabilities?.thinking ?? false;
    if (!supportsThinking) return;
    setThinkingBudget(budget);
  };

  const currentMetadata = selectedModelId ? getModelMetadata(selectedModelId) : null;
  const supportsThinking = currentMetadata?.capabilities?.thinking ?? false;
  const isThinkingDisabled = !supportsThinking;

  const noResults =
    effectiveSearchQuery !== '' &&
    Object.values(modelGroups).every((models) => models.length === 0);

  return (
    <div
      className={cn(
        'w-72 rounded-xl border border-gray-200/70 bg-white/95 p-3 text-left shadow-2xl backdrop-blur-xl',
        'dark:border-gray-700 dark:bg-[#1a1a2e]/95',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Models
        </p>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {manualSelectionEnabled ? 'Choose a model' : 'Auto routing'}
        </span>
      </div>

      {/* Search */}
      {manualSelectionEnabled && (
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models..."
            aria-label="Search models"
            className={cn(
              'w-full pl-7 pr-7 py-1.5 text-xs rounded-lg border transition-colors',
              'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500',
              'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50',
            )}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Auto Selection Section */}
      {!effectiveSearchQuery && (
        <div className="mb-2 space-y-1">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Auto Selection
          </div>
          {availableAutoModes.map((modeId) => {
            const config = AUTO_MODE_CONFIG[modeId];
            if (!config) return null;
            const isSelected = selectedModelId === modeId;
            const IconComponent = config.icon;
            return (
              <button
                type="button"
                key={modeId}
                onClick={() => handleAutoSelect(modeId)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors',
                  isSelected
                    ? 'border-amber-500 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-600 dark:border-amber-500/50 dark:from-amber-500/20 dark:to-orange-500/20 dark:text-amber-400'
                    : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-gray-700',
                )}
              >
                <div className="flex items-center gap-2">
                  <IconComponent
                    size={14}
                    className={isSelected ? 'text-amber-500' : 'text-gray-500'}
                  />
                  <div className="text-left">
                    <div className="font-medium">{config.name}</div>
                    <div className="text-[9px] text-gray-500 dark:text-gray-400">
                      {config.description}
                    </div>
                  </div>
                </div>
                {isSelected && <Check size={14} className="text-amber-500" />}
              </button>
            );
          })}

          {isAutoMode && (
            <div className="ml-6 mt-1 rounded-md bg-gray-50 px-3 py-1.5 text-[10px] dark:bg-gray-800">
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <Sparkles size={10} className="text-amber-500" />
                {lastRoutingDecision?.wasRouted ? (
                  <span>
                    Last used{' '}
                    <span className="font-medium text-gray-800 dark:text-gray-100">
                      {getModelMetadata(lastRoutingDecision.routedModelId)?.name ??
                        lastRoutingDecision.routedModelId}
                    </span>
                    <span className="ml-1">({lastRoutingDecision.taskType})</span>
                  </span>
                ) : (
                  <span>Best model selected automatically for each request</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {manualSelectionEnabled && (
        <>
          <hr className="my-2 border-gray-200 dark:border-gray-700" />

          {/* Model List */}
          <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
            {noResults && (
              <div className="py-6 text-center">
                <Search size={24} className="mx-auto mb-2 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No models found for &quot;{searchQuery}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-[10px] text-primary hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}

            {visibleManagedProviders.map((provider) => {
              const models = modelGroups[provider] ?? [];
              if (models.length === 0) return null;
              const providerLabel = PROVIDER_LABELS[provider] ?? provider;

              return (
                <div key={provider} className="space-y-1">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {providerLabel}
                  </div>
                  <div className="flex flex-col gap-1">
                    {models.map((model) => {
                      const isActive = model.id === selectedModelId;
                      const qualityLabel = getQualityLabel(model.qualityTier);

                      return (
                        <button
                          type="button"
                          key={model.id}
                          onClick={() => handleSelectModel(model.id)}
                          title={model.name}
                          aria-label={model.name}
                          className={cn(
                            'flex w-full flex-col rounded-lg border px-3 py-1.5 text-xs transition-colors text-left',
                            isActive
                              ? 'border-primary bg-primary/10 text-primary shadow-sm dark:border-primary/50 dark:bg-primary/20'
                              : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-gray-700',
                          )}
                        >
                          <div className="flex w-full items-center justify-between gap-1">
                            <span className="flex items-center gap-1 truncate">
                              <span className="truncate font-medium">{model.name}</span>
                              <span className="flex items-center gap-0.5 shrink-0">
                                {model.capabilities?.tools && (
                                  <span aria-label="Tool use">
                                    <Wand2 size={10} className="text-blue-500 dark:text-blue-400" />
                                  </span>
                                )}
                                {model.capabilities?.thinking && (
                                  <span aria-label="Extended thinking">
                                    <Brain
                                      size={10}
                                      className="text-purple-500 dark:text-purple-400"
                                    />
                                  </span>
                                )}
                                {model.capabilities?.vision && (
                                  <span aria-label="Vision">
                                    <Sparkles
                                      size={10}
                                      className="text-amber-500 dark:text-amber-400"
                                    />
                                  </span>
                                )}
                                {model.capabilities?.search && (
                                  <span aria-label="Web search">
                                    <Search
                                      size={10}
                                      className="text-green-500 dark:text-green-400"
                                    />
                                  </span>
                                )}
                              </span>
                            </span>
                            {isActive ? (
                              <Check size={14} className="text-primary shrink-0" />
                            ) : (
                              <span
                                className={cn(
                                  'text-[10px] font-medium shrink-0',
                                  qualityLabel.className,
                                )}
                              >
                                {qualityLabel.text}
                              </span>
                            )}
                          </div>

                          <div className="mt-0.5 flex items-center gap-2">
                            {model.contextWindow > 0 && (
                              <span className="text-[9px] text-gray-400 dark:text-gray-500">
                                {formatContextWindow(model.contextWindow)} ctx
                              </span>
                            )}
                            {(model.inputCost !== undefined || model.outputCost !== undefined) && (
                              <span className="text-[9px] text-gray-400 dark:text-gray-500">
                                {formatPrice(model.inputCost ?? 0)}/
                                {formatPrice(model.outputCost ?? 0)}
                                <span className="ml-0.5 text-gray-300 dark:text-gray-600">/1M</span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Thinking Budget Section */}
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div
          className={cn('rounded-lg px-2 py-1.5', isThinkingDisabled && 'opacity-50')}
          title={
            isThinkingDisabled
              ? 'This model does not support Thinking Mode'
              : 'Set thinking token budget'
          }
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Brain
              size={12}
              className={
                thinkingEnabled && !isThinkingDisabled
                  ? 'text-amber-500'
                  : 'text-gray-400 dark:text-gray-500'
              }
            />
            <span
              className={cn(
                'text-[10px] font-medium',
                thinkingEnabled && !isThinkingDisabled
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 dark:text-gray-400',
              )}
            >
              Think
            </span>
          </div>
          <div className="flex items-center gap-1">
            {THINKING_BUDGET_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => handleBudgetSelect(opt.value)}
                disabled={isThinkingDisabled}
                aria-label={`Set thinking budget to ${opt.label}`}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                  thinkingBudget === opt.value && !isThinkingDisabled
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/40'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                  isThinkingDisabled && 'cursor-not-allowed',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickModelSelector;
