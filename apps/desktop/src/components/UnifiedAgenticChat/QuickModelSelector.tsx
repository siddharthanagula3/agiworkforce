import {
  Brain,
  Check,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Wand2,
  X,
  Zap,
  DollarSign,
  Crown,
} from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  getModelMetadata,
  PROVIDER_LABELS,
  PROVIDERS_IN_ORDER,
  THINKING_MODEL_VARIANTS,
  isModelAllowedForTier,
  type ModelMetadata,
} from '../../constants/llm';
import type { SubscriptionTier } from '../../constants/planModels';
import { cn } from '../../lib/utils';
import { useAccountStore, selectIsTierLoading } from '../../stores/auth';
import { useModelStore, selectLastRoutingDecision } from '../../stores/modelStore';
import type { Provider } from '../../stores/settingsStore';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { Button } from '../ui/Button';
import { ModelTierSelector, type ModelTier } from './ModelTierSelector';

type QuickModelSelectorProps = {
  className?: string;
  onClose?: () => void;
};

type RouterSuggestion = {
  provider: Provider;
  model: string;
  reason: string;
};

const AUTO_MODEL_ID = 'auto'; // Legacy - maps to AutoBalanced
const AUTO_ECONOMY_ID = 'auto-economy';
const AUTO_BALANCED_ID = 'auto-balanced';
const AUTO_PREMIUM_ID = 'auto-premium';

const getQualityTierLabel = (tier: 'fast' | 'balanced' | 'best') => {
  const labels: Record<'fast' | 'balanced' | 'best', { text: string; className: string }> = {
    fast: { text: 'Fast', className: 'text-emerald-600 dark:text-emerald-400' },
    balanced: { text: 'Balanced', className: 'text-blue-600 dark:text-blue-400' },
    best: { text: 'Best', className: 'text-amber-600 dark:text-amber-400' },
  };
  return labels[tier];
};

export const QuickModelSelector = ({ className, onClose }: QuickModelSelectorProps) => {
  const {
    selectedModel,
    availableModels,
    selectModel,
    thinkingModeEnabled,
    thinkingBudget,
    setThinkingBudget,
    getAvailableModels,
  } = useModelStore(
    useShallow((state) => ({
      selectedModel: state.selectedModel,
      availableModels: state.availableModels,
      selectModel: state.selectModel,
      thinkingModeEnabled: state.thinkingModeEnabled,
      thinkingBudget: state.thinkingBudget,
      setThinkingBudget: state.setThinkingBudget,
      getAvailableModels: state.getAvailableModels,
    })),
  );

  const { account, isTierLoading } = useAccountStore(
    useShallow((state) => ({
      account: state.account,
      isTierLoading: selectIsTierLoading(state),
    })),
  );

  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  // Get user's plan tier - when loading/unknown, use 'hobby' as a safe default
  // This ensures users can see some models while we confirm their actual tier
  // NEVER default to 'free' as it would block paid users from their models
  const userPlanTier = account.plan ?? 'hobby';

  const modelsLoaded = useRef(false);

  useEffect(() => {
    // Delay the model fetch to avoid race conditions during popover mount
    const timer = setTimeout(() => {
      if (!modelsLoaded.current && availableModels.length === 0) {
        modelsLoaded.current = true;
        void getAvailableModels();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [availableModels.length, getAvailableModels]);

  // Router suggestion feature is disabled - keeping state for potential future re-enablement
  const [suggestion] = useState<RouterSuggestion | null>(null);
  const [suggestionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const modelGroups = useMemo(() => {
    const groups: Record<string, ModelMetadata[]> = {};
    const allProviders: Provider[] = PROVIDERS_IN_ORDER;
    const query = searchQuery.toLowerCase().trim();
    const tier = (userPlanTier as SubscriptionTier) || 'hobby';

    allProviders.forEach((p) => {
      groups[p] = [];
    });

    availableModels.forEach((model) => {
      const group = groups[model.provider];
      if (group) {
        let metadata = getModelMetadata(model.id);

        if (!metadata && model.provider === 'ollama') {
          metadata = {
            id: model.id,
            name: model.name,
            provider: 'ollama',
            modelType: 'chat',
            contextWindow: 4096,
            inputCost: 0,
            outputCost: 0,
            capabilities: {
              streaming: true,
              tools: false, // Most Ollama models don't support tools
              vision: false, // Check specific model for vision (llava, etc.)
              json: true,
              thinking: false,
              computerUse: false,
              agentic: false,
              imageGen: false,
              videoGen: false,
              search: false,
              research: false,
              codeExecution: false, // Local models don't have code sandboxes
            },
            speed: 'medium',
            quality: 'good',
            qualityTier: 'balanced',
            bestFor: ['Local Inference', 'Privacy'],
          };
        }

        if (metadata) {
          // Mark models that require a higher tier (but still show them)
          const isAllowed = model.provider === 'ollama' || isModelAllowedForTier(model.id, tier);
          (metadata as ModelMetadata & { locked?: boolean }).locked = !isAllowed;

          // Filter by search query
          if (query) {
            const matchesName = metadata.name.toLowerCase().includes(query);
            const matchesId = metadata.id.toLowerCase().includes(query);
            const matchesProvider = metadata.provider.toLowerCase().includes(query);
            const matchesBestFor = metadata.bestFor?.some((tag) =>
              tag.toLowerCase().includes(query),
            );
            if (!matchesName && !matchesId && !matchesProvider && !matchesBestFor) {
              return;
            }
          }
          group.push(metadata);
        }
      }
    });

    return groups;
  }, [availableModels, searchQuery, userPlanTier]);

  // NOTE: Router suggestions feature has been replaced by Auto modes (Economy/Balanced/Premium).
  // The Auto modes use backend routing logic rather than client-side suggestions.
  // The suggestion state is kept for potential future per-model recommendations.

  const handleModelChange = (modelId: string) => {
    if (
      modelId === AUTO_MODEL_ID ||
      modelId === AUTO_ECONOMY_ID ||
      modelId === AUTO_BALANCED_ID ||
      modelId === AUTO_PREMIUM_ID
    ) {
      // Use managed_cloud as the default provider container for Auto models
      void selectModel(modelId, 'managed_cloud');
      onClose?.();
      return;
    }

    const metadata = availableModels.find((m) => m.id === modelId) || getModelMetadata(modelId);
    if (!metadata) {
      return;
    }

    void selectModel(modelId, metadata.provider);
    onClose?.();
  };

  const isAutoMode =
    selectedModel === AUTO_MODEL_ID ||
    selectedModel === AUTO_ECONOMY_ID ||
    selectedModel === AUTO_BALANCED_ID ||
    selectedModel === AUTO_PREMIUM_ID;

  // --- Tier selector helpers ---

  /**
   * Returns the first available model for a given qualityTier.
   * Prefers models already in availableModels; falls back to getAllModels().
   */
  const tierModelMap = useMemo((): Record<ModelTier, string | null> => {
    const tier = (userPlanTier as SubscriptionTier) || 'hobby';

    const findModel = (qualityTier: 'fast' | 'balanced' | 'best'): string | null => {
      // Prefer models the user has configured that are in their plan
      const configured = availableModels.find((m) => {
        const meta = getModelMetadata(m.id);
        return (
          meta?.qualityTier === qualityTier &&
          (m.provider === 'ollama' || isModelAllowedForTier(m.id, tier))
        );
      });
      if (configured) return configured.id;
      return null;
    };

    return {
      instant: findModel('fast'),
      latest: findModel('balanced'),
      thinking: findModel('best'),
    };
  }, [availableModels, userPlanTier]);

  /**
   * Derives the active tier from the currently selected model.
   * Returns null when an auto mode or no-metadata model is active.
   */
  const activeTier = useMemo((): ModelTier | null => {
    if (!selectedModel || isAutoMode) return null;
    const meta = getModelMetadata(selectedModel);
    if (!meta) return null;
    switch (meta.qualityTier) {
      case 'fast':
        return 'instant';
      case 'balanced':
        return 'latest';
      case 'best':
        return 'thinking';
      default:
        return null;
    }
  }, [selectedModel, isAutoMode]);

  const handleTierSelect = (tier: ModelTier) => {
    const modelId = tierModelMap[tier];
    if (!modelId) return;
    handleModelChange(modelId);
  };

  // Get last routing decision for feedback
  const lastRoutingDecision = useModelStore(selectLastRoutingDecision);

  // Auto mode configurations with icons and descriptions
  const autoModeConfig = {
    [AUTO_ECONOMY_ID]: {
      name: 'Auto (Economy)',
      description: 'Fastest, most cost-effective',
      icon: DollarSign,
      models: 'Gemini Flash, GPT-5 Nano, DeepSeek',
    },
    [AUTO_BALANCED_ID]: {
      name: 'Auto (Balanced)',
      description: 'Quality/cost sweet spot',
      icon: Zap,
      models: 'Claude Sonnet, Gemini Pro, GPT-5.2',
    },
    [AUTO_PREMIUM_ID]: {
      name: 'Auto (Premium)',
      description: 'Maximum performance',
      icon: Crown,
      models: 'Claude Opus, GPT-5 Pro',
    },
  };

  // Determine which auto modes to show based on plan tier
  // Tier hierarchy: hobby/free → economy only, pro → +balanced, max/enterprise → +premium
  const availableAutoModes = useMemo(() => {
    const plan = (userPlanTier as string).toLowerCase();

    // Max/Enterprise: All auto modes
    if (plan === 'max' || plan === 'enterprise') {
      return [AUTO_ECONOMY_ID, AUTO_BALANCED_ID, AUTO_PREMIUM_ID];
    }

    // Pro: Economy + Balanced
    if (plan === 'pro') {
      return [AUTO_ECONOMY_ID, AUTO_BALANCED_ID];
    }

    // Hobby/Free/Unknown: Economy only (safe default)
    return [AUTO_ECONOMY_ID];
  }, [userPlanTier]);
  const suggestedMetadata = suggestion
    ? availableModels.find((m) => m.id === suggestion.model) || getModelMetadata(suggestion.model)
    : null;

  // Auto-switch to suggested model when suggestion loads (Auto mode behavior)
  // Auto-switch effect removed to keep "Auto" selected
  // The UI will still show "Routing to [Model]" but the selection remains "Auto"

  return (
    <div
      className={cn(
        'w-72 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] p-3 text-left shadow-2xl backdrop-blur-xl',
        '',
        className,
      )}
    >
      {/* Loading banner when subscription tier is being fetched */}
      {isTierLoading && (
        <div className="mb-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin text-blue-500 dark:text-blue-400" />
          <span className="text-[10px] text-blue-700 dark:text-blue-300">
            Setting up your workspace...
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Models
        </p>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Choose a provider</span>
      </div>

      {/* Quick tier picker — Instant / Latest / Thinking */}
      <div className="mb-2">
        <ModelTierSelector
          activeTier={activeTier}
          onTierSelect={handleTierSelect}
          className="w-full justify-between"
        />
      </div>

      {/* Search Input */}
      <div className="relative mb-2">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search models..."
          className={cn(
            'w-full pl-7 pr-7 py-1.5 text-xs rounded-lg border transition-colors',
            'bg-[hsl(var(--muted))] border-[hsl(var(--border))]',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'focus:outline-hidden focus:ring-1 focus:ring-primary/50 focus:border-primary/50',
          )}
        />
        {searchQuery && (
          <button
            type="button"
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

      {/* Auto Selection Section */}
      <div className="mb-2 space-y-1">
        <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Auto Selection
        </div>
        {availableAutoModes.map((modeId) => {
          const config = autoModeConfig[modeId as keyof typeof autoModeConfig];
          const isSelected = selectedModel === modeId;
          const IconComponent = config?.icon ?? Wand2;
          return (
            <button
              type="button"
              key={modeId}
              onClick={() => handleModelChange(modeId)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors',
                isSelected
                  ? 'border-amber-500 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-600 shadow-xs dark:border-amber-500/50 dark:from-amber-500/20 dark:to-orange-500/20 dark:text-amber-400'
                  : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:border-primary/50 hover:bg-[hsl(var(--accent))]',
              )}
            >
              <div className="flex items-center gap-2">
                <IconComponent
                  size={14}
                  className={isSelected ? 'text-amber-500' : 'text-gray-500'}
                />
                <div className="text-left">
                  <div className="font-medium">{config?.name ?? modeId}</div>
                  <div className="text-[9px] text-gray-500 dark:text-gray-400">
                    {config?.description}
                  </div>
                </div>
              </div>
              {isSelected && <Check size={14} className="text-amber-500" />}
            </button>
          );
        })}

        {/* Show last routing decision if in auto mode */}
        {isAutoMode && lastRoutingDecision?.wasRouted && (
          <div className="ml-6 mt-1 rounded-md bg-[hsl(var(--muted))] px-3 py-1.5 text-[10px]">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <Sparkles size={10} className="text-amber-500" />
              <span>
                Last used:{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {getModelMetadata(lastRoutingDecision.routedModelId)?.name ??
                    lastRoutingDecision.routedModelId}
                </span>
                <span className="ml-1 text-gray-400">({lastRoutingDecision.taskType})</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <hr className="my-2 border-[hsl(var(--border))]" />

      {/* Plan info removed */}

      {}
      {!isAutoMode && suggestion && suggestedMetadata && (
        <div className="mb-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2 text-xs text-primary dark:border-primary/30 dark:bg-primary/10 dark:text-primary-foreground">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles size={12} />
              Recommended
            </div>
            <Button
              size="xs"
              variant="outline"
              className="h-6 text-[10px]"
              disabled={suggestionLoading || selectedModel === suggestion.model}
              onClick={() => handleModelChange(suggestion.model)}
            >
              Use
            </Button>
          </div>
          <p className="mt-1.5 font-semibold text-gray-900 dark:text-gray-100">
            {suggestedMetadata.name}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-gray-600 dark:text-gray-400">
            {suggestion.reason}
          </p>
        </div>
      )}

      <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
        {/* No results message */}
        {searchQuery && Object.values(modelGroups).every((models) => models.length === 0) && (
          <div className="py-6 text-center">
            <Search size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No models found for "{searchQuery}"
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

        {/* Available Models Section */}
        {Object.entries(modelGroups).map(([provider, models]) => {
          if (models.length === 0) return null;
          return (
            <div key={provider} className="space-y-1">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {PROVIDER_LABELS[provider as Provider]}
              </div>
              <div className="flex flex-col gap-1">
                {models.map((model) => {
                  const isActive = model.id === selectedModel;
                  const isLocked = (model as ModelMetadata & { locked?: boolean }).locked;

                  return (
                    <button
                      type="button"
                      key={model.id}
                      onClick={() => {
                        if (isLocked) {
                          openSettings('account');
                          onClose?.();
                          return;
                        }
                        handleModelChange(model.id);
                      }}
                      title={isLocked ? 'Requires PRO — click to upgrade' : model.name}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-xs transition-colors',
                        isLocked
                          ? 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] opacity-60 cursor-pointer hover:opacity-80 hover:border-amber-500/50'
                          : isActive
                            ? 'border-primary bg-primary/10 text-primary shadow-xs dark:border-primary/50 dark:bg-primary/20 dark:text-primary-foreground'
                            : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:border-primary/50 hover:bg-[hsl(var(--accent))]',
                      )}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <span className="truncate">{model.name}</span>
                        {isLocked && (
                          <span className="text-[10px] text-amber-500 font-medium ml-1">PRO</span>
                        )}
                        {isLocked && <Lock size={10} className="text-amber-500 shrink-0" />}
                        {/* Capability badges */}
                        <span className="flex items-center gap-0.5 shrink-0">
                          {model.capabilities.tools && (
                            <span aria-label="Tool use">
                              <Wand2 size={10} className="text-blue-500 dark:text-blue-400" />
                            </span>
                          )}
                          {model.capabilities.thinking && (
                            <span aria-label="Extended thinking">
                              <Brain size={10} className="text-purple-500 dark:text-purple-400" />
                            </span>
                          )}
                          {model.capabilities.vision && (
                            <span aria-label="Vision">
                              <Sparkles size={10} className="text-amber-500 dark:text-amber-400" />
                            </span>
                          )}
                          {model.capabilities.search && (
                            <span aria-label="Web search">
                              <Search size={10} className="text-green-500 dark:text-green-400" />
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
                            getQualityTierLabel(model.qualityTier).className,
                          )}
                        >
                          {getQualityTierLabel(model.qualityTier).text}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-[hsl(var(--border))]">
        {(() => {
          const currentMetadata = selectedModel ? getModelMetadata(selectedModel) : null;
          const supportsThinking = currentMetadata?.capabilities.thinking ?? false;
          const smartVariantId = selectedModel ? THINKING_MODEL_VARIANTS[selectedModel] : undefined;

          const isDisabled = !supportsThinking && !smartVariantId;

          const budgetOptions = [
            { label: 'Off', value: 0 },
            { label: '1K', value: 1024 },
            { label: '4K', value: 4096 },
            { label: '8K', value: 8192 },
            { label: '16K', value: 16384 },
            { label: '32K', value: 32768 },
          ];

          const handleBudgetSelect = (budget: number) => {
            if (isDisabled) return;

            // If model doesn't natively support thinking, switch to variant first
            if (!supportsThinking && smartVariantId && budget > 0) {
              const variantMetadata = getModelMetadata(smartVariantId);
              if (variantMetadata) {
                void selectModel(smartVariantId, variantMetadata.provider);
              }
            }

            setThinkingBudget(budget);
          };

          return (
            <div
              className={cn('rounded-lg px-2 py-1.5', isDisabled && 'opacity-50')}
              title={
                isDisabled ? 'This model does not support Thinking Mode' : 'Set thinking budget'
              }
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Brain
                  size={12}
                  className={
                    thinkingModeEnabled ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'
                  }
                />
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    thinkingModeEnabled
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                >
                  Think
                </span>
              </div>
              <div className="flex items-center gap-1">
                {budgetOptions.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => handleBudgetSelect(opt.value)}
                    disabled={isDisabled}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                      thinkingBudget === opt.value
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/40'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]',
                      isDisabled && 'cursor-not-allowed',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default QuickModelSelector;
