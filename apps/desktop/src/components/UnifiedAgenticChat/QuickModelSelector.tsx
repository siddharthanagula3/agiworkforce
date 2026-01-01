import { invoke } from '@/lib/tauri-mock';
import { Brain, Check, Search, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  getModelMetadata,
  PROVIDER_LABELS,
  PROVIDERS_IN_ORDER,
  THINKING_MODEL_VARIANTS,
  type ModelMetadata,
} from '../../constants/llm';
import { canUseModel } from '../../constants/planModels';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { cn } from '../../lib/utils';
import { useAccountStore } from '../../stores/accountStore';
import { useModelStore } from '../../stores/modelStore';
import type { Provider } from '../../stores/settingsStore';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { Button } from '../ui/Button';

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
    toggleThinkingMode,
    getAvailableModels,
  } = useModelStore((state) => ({
    selectedModel: state.selectedModel,
    availableModels: state.availableModels,
    favorites: state.favorites,
    recentModels: state.recentModels,
    selectModel: state.selectModel,
    thinkingModeEnabled: state.thinkingModeEnabled,
    toggleThinkingMode: state.toggleThinkingMode,
    getAvailableModels: state.getAvailableModels,
  }));

  const { account } = useAccountStore((state) => ({
    account: state.account,
  }));

  // Get user's plan tier (defaults to 'free' if not subscribed)
  const userPlanTier = account.plan || 'free';

  useEffect(() => {
    if (availableModels.length <= 15) {
      void getAvailableModels();
    }
  }, [getAvailableModels, availableModels.length]);

  const messages = useUnifiedChatStore((state) => state.messages);
  const [suggestion, setSuggestion] = useState<RouterSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((msg) => msg.role === 'user'),
    [messages],
  );

  const suggestionContext = useMemo(() => {
    return deriveTaskMetadata(
      latestUserMessage?.content ?? '',
      latestUserMessage?.attachments,
      'balanced',
    );
  }, [latestUserMessage]);

  const modelGroups = useMemo(() => {
    const groups: Record<string, ModelMetadata[]> = {};
    const allProviders: Provider[] = PROVIDERS_IN_ORDER;
    const query = searchQuery.toLowerCase().trim();

    allProviders.forEach((p) => {
      groups[p] = [];
    });

    availableModels.forEach((model) => {
      // Filter models based on user's plan
      const planTier = userPlanTier as any;
      if (model.provider !== 'ollama' && !canUseModel(planTier, model.id)) {
        return; // Skip models not available for this plan, but always allow local Ollama
      }

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
              tools: false,
              vision: false,
              json: true,
              thinking: false,
              computerUse: false,
              agentic: false,
              imageGen: false,
              videoGen: false,
              search: false,
              research: false,
            },
            speed: 'medium',
            quality: 'good',
            qualityTier: 'balanced',
            bestFor: ['Local Inference', 'Privacy'],
          };
        }

        if (metadata) {
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
  }, [availableModels, userPlanTier, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const fetchSuggestion = async () => {
      setSuggestionLoading(true);
      try {
        const response = await invoke<RouterSuggestion>('router_suggestions', {
          context: {
            intents: suggestionContext.intents,
            requiresVision: suggestionContext.requiresVision,
            tokenEstimate: suggestionContext.tokenEstimate,
            costPriority: suggestionContext.costPriority,
            planTier: userPlanTier,
          },
        });
        if (!cancelled) {
          setSuggestion(response);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[QuickModelSelector] Failed to load suggestion', error);
          setSuggestion(null);
        }
      } finally {
        if (!cancelled) {
          setSuggestionLoading(false);
        }
      }
    };

    fetchSuggestion();
    return () => {
      cancelled = true;
    };
  }, [suggestionContext, userPlanTier]);

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

  // Determine which auto modes to show based on plan tier
  const availableAutoModes = useMemo(() => {
    const plan = userPlanTier as string;
    if (plan === 'hobby' || plan === 'free' || plan === 'none') {
      return [
        { id: AUTO_ECONOMY_ID, name: 'Auto (Best Value)', description: 'Cost-optimized for Hobby' },
      ];
    } else if (plan === 'pro') {
      return [
        { id: AUTO_ECONOMY_ID, name: 'Auto (Best Value)', description: 'Cost-optimized' },
        { id: AUTO_BALANCED_ID, name: 'Auto Balanced', description: 'Quality/cost balance' },
      ];
    } else if (plan === 'max' || plan === 'enterprise') {
      return [
        { id: AUTO_ECONOMY_ID, name: 'Auto (Best Value)', description: 'Cost-optimized' },
        { id: AUTO_BALANCED_ID, name: 'Auto Balanced', description: 'Quality/cost balance' },
        { id: AUTO_PREMIUM_ID, name: 'Auto (Best Model)', description: 'Maximum performance' },
      ];
    }
    return [{ id: AUTO_BALANCED_ID, name: 'Auto Balanced', description: 'Quality/cost balance' }];
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
        'w-72 rounded-xl border border-gray-200/70 bg-white/95 p-3 text-left shadow-2xl backdrop-blur-xl',
        'dark:border-gray-700 dark:bg-charcoal-900/95',
        className,
      )}
    >
      <div className="flex items-center justify-between pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Models
        </p>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Choose a provider</span>
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
            'bg-gray-50 dark:bg-charcoal-800 border-gray-200 dark:border-gray-700',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50',
          )}
        />
        {searchQuery && (
          <button
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

      {}
      <div className="mb-2 space-y-1">
        <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Smart Routing (2026)
        </div>
        {availableAutoModes.map((mode) => {
          const isSelected = selectedModel === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => handleModelChange(mode.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors',
                isSelected
                  ? 'border-primary bg-gradient-to-r from-primary/10 to-purple-500/10 text-primary shadow-sm dark:border-primary/50 dark:from-primary/20 dark:to-purple-500/20 dark:text-primary-foreground'
                  : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-charcoal-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-charcoal-700',
              )}
            >
              <div className="flex items-center gap-2">
                <Wand2 size={14} className={isSelected ? 'text-primary' : 'text-gray-500'} />
                <div className="text-left">
                  <div className="font-medium">{mode.name}</div>
                  <div className="text-[9px] text-gray-500 dark:text-gray-400">
                    {mode.description}
                  </div>
                </div>
              </div>
              {isSelected && <Check size={14} className="text-primary" />}
            </button>
          );
        })}

        {}
        {isAutoMode && suggestion && suggestedMetadata && (
          <div className="ml-6 mt-1 rounded-md bg-gray-50 px-3 py-1.5 text-[10px] dark:bg-charcoal-800">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <Sparkles size={10} />
              <span>
                Routing to{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {suggestedMetadata.name}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      <hr className="my-2 border-gray-200 dark:border-gray-700" />

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

                  // Determine which plan tier(s) this model requires
                  const getModelTierTag = (modelId: string): string => {
                    const hobbySafe = canUseModel('hobby' as any, modelId);
                    const proSafe = canUseModel('pro' as any, modelId);
                    const maxSafe = canUseModel('max' as any, modelId);

                    if (maxSafe && !proSafe) return 'Max Only';
                    if (proSafe && !hobbySafe) return 'Pro+';
                    if (hobbySafe) return 'Hobby+';
                    return '';
                  };

                  const tierTag = getModelTierTag(model.id);

                  return (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-xs transition-colors',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary shadow-sm dark:border-primary/50 dark:bg-primary/20 dark:text-primary-foreground'
                          : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-charcoal-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-charcoal-700',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{model.name}</span>
                        {tierTag && !isActive && (
                          <span
                            className={cn(
                              'text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0',
                              tierTag === 'Max Only'
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                : tierTag === 'Pro+'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                            )}
                          >
                            {tierTag}
                          </span>
                        )}
                      </div>
                      {isActive ? (
                        <Check size={14} className="text-primary flex-shrink-0" />
                      ) : (
                        <span
                          className={cn(
                            'text-[10px] font-medium flex-shrink-0',
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

        {/* Locked Models Info */}
        {(userPlanTier === 'free' || userPlanTier === 'hobby') && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-[8px] text-gray-600 dark:text-gray-500 px-1">
              🔒 <span className="font-semibold">Premium models locked:</span> Claude Opus,
              GPT-5.2-Pro, GPT-5.1-Thinking and 10+ others require Pro/Max plan.
            </p>
          </div>
        )}
        {userPlanTier === 'pro' && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-[8px] text-gray-600 dark:text-gray-500 px-1">
              🔒 <span className="font-semibold">Enterprise models locked:</span> Claude Opus
              ($15/$75), GPT-5.2-Pro ($10/$30) require Max plan.
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        {(() => {
          const currentMetadata = selectedModel ? getModelMetadata(selectedModel) : null;
          const supportsThinking = currentMetadata?.capabilities.thinking ?? false;
          const smartVariantId = selectedModel ? THINKING_MODEL_VARIANTS[selectedModel] : undefined;
          const smartVariantName = smartVariantId ? getModelMetadata(smartVariantId)?.name : null;

          const isDisabled = !supportsThinking && !smartVariantId;
          const tooltip = isDisabled
            ? 'This model does not support Thinking Mode'
            : !supportsThinking && smartVariantName
              ? `Switch to ${smartVariantName} to enable Thinking Mode`
              : 'Enable Thinking Mode';

          return (
            <button
              onClick={() => {
                if (isDisabled) return;

                if (!supportsThinking && smartVariantId) {
                  // Smart Switch
                  const variantMetadata = getModelMetadata(smartVariantId);
                  if (variantMetadata) {
                    void selectModel(smartVariantId, variantMetadata.provider);
                    if (!thinkingModeEnabled) {
                      toggleThinkingMode();
                    }
                  }
                } else {
                  // Standard Toggle
                  toggleThinkingMode();
                }
              }}
              disabled={isDisabled}
              title={tooltip}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-2 py-1 text-[10px] transition-colors',
                thinkingModeEnabled
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-charcoal-800',
                isDisabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                <Brain size={12} />
                <span>Thinking Mode</span>
              </div>
              <div
                className={cn(
                  'h-3.5 w-6 rounded-full p-0.5 transition-colors',
                  thinkingModeEnabled ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600',
                )}
              >
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform',
                    thinkingModeEnabled ? 'translate-x-2.5' : 'translate-x-0',
                  )}
                />
              </div>
            </button>
          );
        })()}
      </div>
    </div>
  );
};

export default QuickModelSelector;
