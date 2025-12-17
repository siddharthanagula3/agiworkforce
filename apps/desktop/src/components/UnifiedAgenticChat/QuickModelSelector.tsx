import { invoke } from '@/lib/tauri-mock';
import { Brain, Check, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getModelMetadata,
  getProviderModels,
  PROVIDER_LABELS,
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

// Special ID for auto-routing mode
const AUTO_MODEL_ID = 'auto';

export const QuickModelSelector = ({ className, onClose }: QuickModelSelectorProps) => {
  const {
    selectedModel,
    favorites,
    recentModels,
    selectModel,
    thinkingModeEnabled,
    toggleThinkingMode,
  } = useModelStore((state) => ({
    selectedModel: state.selectedModel,
    favorites: state.favorites,
    recentModels: state.recentModels,
    selectModel: state.selectModel,
    thinkingModeEnabled: state.thinkingModeEnabled,
    toggleThinkingMode: state.toggleThinkingMode,
  }));
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
    const allProviders: Provider[] = [
      'openai',
      'anthropic',
      'google',
      'ollama',
      'xai',
      'deepseek',
      'qwen',
      'mistral',
      'moonshot',
    ];

    allProviders.forEach((p) => {
      groups[p] = [];
    });

    const addModel = (metadata: ModelMetadata) => {
      const providerGroup = groups[metadata.provider];
      if (providerGroup && !providerGroup.some((m) => m.id === metadata.id)) {
        providerGroup.push(metadata);
      }
    };

    allProviders.forEach((provider) => {
      getProviderModels(provider).forEach(addModel);
    });

    favorites.forEach((id) => {
      const meta = getModelMetadata(id);
      if (meta) addModel(meta);
    });
    recentModels.forEach((id) => {
      const meta = getModelMetadata(id);
      if (meta) addModel(meta);
    });

    return groups;
  }, [favorites, recentModels]);

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
    // Special handling for auto mode
    if (modelId === AUTO_MODEL_ID) {
      void selectModel(AUTO_MODEL_ID, 'openai'); // Provider is ignored for auto
      onClose?.();
      return;
    }

    const metadata = getModelMetadata(modelId);
    if (!metadata) {
      return;
    }

    void selectModel(modelId, metadata.provider);
    onClose?.();
  };

  const isAutoMode = selectedModel === AUTO_MODEL_ID;
  const suggestedMetadata = suggestion ? getModelMetadata(suggestion.model) : null;

  return (
    <div
      className={cn(
        'w-80 rounded-xl border border-gray-200/70 bg-white/95 p-4 text-left shadow-2xl backdrop-blur-xl',
        'dark:border-gray-700 dark:bg-charcoal-900/95',
        className,
      )}
    >
      <div className="flex items-center justify-between pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Models
        </p>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">Choose a provider</span>
      </div>

      {/* Auto Mode Option - Always at top */}
      <div className="mb-3 space-y-1.5">
        <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Smart Routing
        </div>
        <button
          onClick={() => handleModelChange(AUTO_MODEL_ID)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors',
            isAutoMode
              ? 'border-primary bg-gradient-to-r from-primary/10 to-purple-500/10 text-primary shadow-sm dark:border-primary/50 dark:from-primary/20 dark:to-purple-500/20 dark:text-primary-foreground'
              : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-charcoal-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-charcoal-700',
          )}
        >
          <div className="flex items-center gap-2">
            <Wand2 size={16} className={isAutoMode ? 'text-primary' : 'text-gray-500'} />
            <div className="text-left">
              <div className="font-medium">Auto</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                Routes to best model for your task
              </div>
            </div>
          </div>
          {isAutoMode && <Check size={16} className="text-primary" />}
        </button>

        {/* Show current routing when in Auto mode */}
        {isAutoMode && suggestion && suggestedMetadata && (
          <div className="ml-6 mt-1 rounded-md bg-gray-50 px-3 py-2 text-xs dark:bg-charcoal-800">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <Sparkles size={12} />
              <span>
                Currently routing to{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {suggestedMetadata.name}
                </span>
              </span>
            </div>
            <div className="mt-1 text-[10px] text-gray-500">{suggestion.reason}</div>
          </div>
        )}
      </div>

      <hr className="my-3 border-gray-200 dark:border-gray-700" />

      {/* Manual recommendation when not in auto mode */}
      {!isAutoMode && suggestion && suggestedMetadata && (
        <div className="mb-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-sm text-primary dark:border-primary/30 dark:bg-primary/10 dark:text-primary-foreground">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles size={14} />
              Recommended
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={suggestionLoading || selectedModel === suggestion.model}
              onClick={() => handleModelChange(suggestion.model)}
            >
              Use
            </Button>
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {suggestedMetadata.name}{' '}
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
              ({PROVIDER_LABELS[suggestion.provider]})
            </span>
          </p>
          <p className="mt-1 text-xs leading-snug text-gray-600 dark:text-gray-400">
            {suggestion.reason}
          </p>
        </div>
      )}

      <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
        {Object.entries(modelGroups).map(([provider, models]) => {
          if (models.length === 0) return null;
          return (
            <div key={provider} className="space-y-1.5">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {PROVIDER_LABELS[provider as Provider]}
              </div>
              <div className="flex flex-col gap-1.5">
                {models.map((model) => {
                  const isActive = model.id === selectedModel;
                  return (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary shadow-sm dark:border-primary/50 dark:bg-primary/20 dark:text-primary-foreground'
                          : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-charcoal-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-charcoal-700',
                      )}
                    >
                      <span className="truncate">{model.name}</span>
                      {isActive ? (
                        <Check size={16} className="text-primary" />
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
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

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={toggleThinkingMode}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors',
            thinkingModeEnabled
              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-charcoal-800',
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            <Brain size={14} />
            <span>Thinking Mode</span>
          </div>
          <div
            className={cn(
              'h-4 w-7 rounded-full p-0.5 transition-colors',
              thinkingModeEnabled ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600',
            )}
          >
            <div
              className={cn(
                'h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
                thinkingModeEnabled ? 'translate-x-3' : 'translate-x-0',
              )}
            />
          </div>
        </button>
      </div>
    </div>
  );
};

export default QuickModelSelector;
