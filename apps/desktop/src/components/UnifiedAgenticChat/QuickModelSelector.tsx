import { invoke } from '@/lib/tauri-mock';
import { Brain, Check, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getModelMetadata,
  PROVIDER_LABELS,
  PROVIDERS_IN_ORDER,
  THINKING_MODEL_VARIANTS,
  type ModelMetadata,
} from '../../constants/llm';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { cn } from '../../lib/utils';
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

const AUTO_MODEL_ID = 'auto';

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

  useEffect(() => {
    if (availableModels.length <= 15) {
      void getAvailableModels();
    }
  }, [getAvailableModels, availableModels.length]);

  const messages = useUnifiedChatStore((state) => state.messages);
  const [suggestion, setSuggestion] = useState<RouterSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

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
            contextWindow: 4096,
            inputCost: 0,
            outputCost: 0,
            capabilities: {
              streaming: true,
              tools: false,
              vision: false,
              json: true,
              thinking: false,
            },
            speed: 'medium',
            quality: 'good',
            bestFor: ['Local Inference', 'Privacy'],
          };
        }

        if (metadata) {
          group.push(metadata);
        }
      }
    });

    return groups;
  }, [availableModels]);

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
  }, [suggestionContext]);

  const handleModelChange = (modelId: string) => {
    if (modelId === AUTO_MODEL_ID) {
      void selectModel(AUTO_MODEL_ID, 'openai');
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

  const isAutoMode = selectedModel === AUTO_MODEL_ID;
  const suggestedMetadata = suggestion
    ? availableModels.find((m) => m.id === suggestion.model) || getModelMetadata(suggestion.model)
    : null;

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

      {}
      <div className="mb-2 space-y-1">
        <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Smart Routing
        </div>
        <button
          onClick={() => handleModelChange(AUTO_MODEL_ID)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors',
            isAutoMode
              ? 'border-primary bg-gradient-to-r from-primary/10 to-purple-500/10 text-primary shadow-sm dark:border-primary/50 dark:from-primary/20 dark:to-purple-500/20 dark:text-primary-foreground'
              : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-charcoal-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-charcoal-700',
          )}
        >
          <div className="flex items-center gap-2">
            <Wand2 size={14} className={isAutoMode ? 'text-primary' : 'text-gray-500'} />
            <div className="text-left">
              <div className="font-medium">Auto</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">
                Routes to best model
              </div>
            </div>
          </div>
          {isAutoMode && <Check size={14} className="text-primary" />}
        </button>

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

      <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
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
                      <span className="truncate">{model.name}</span>
                      {isActive ? (
                        <Check size={14} className="text-primary" />
                      ) : (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {PROVIDER_LABELS[model.provider]}
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
