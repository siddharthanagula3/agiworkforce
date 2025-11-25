import { invoke } from '@/lib/tauri-mock';
import { Check, Sparkles } from 'lucide-react';
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

export const QuickModelSelector = ({ className, onClose }: QuickModelSelectorProps) => {
  const { selectedModel, favorites, recentModels, selectModel } = useModelStore((state) => ({
    selectedModel: state.selectedModel,
    favorites: state.favorites,
    recentModels: state.recentModels,
    selectModel: state.selectModel,
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
    const metadata = getModelMetadata(modelId);
    if (!metadata) {
      return;
    }

    void selectModel(modelId, metadata.provider);
    onClose?.();
  };

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

      {suggestion && suggestedMetadata && (
        <div className="mb-3 rounded-lg border border-dashed border-teal-500/40 bg-teal-50/70 p-3 text-sm text-teal-800 dark:border-teal-500/40 dark:bg-teal-900/15 dark:text-teal-100">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-200">
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

      <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
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
                          ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm dark:border-teal-500/60 dark:bg-teal-500/10 dark:text-teal-50'
                          : 'border-gray-200 bg-white text-gray-900 hover:border-teal-500/70 hover:bg-gray-50 dark:border-gray-700 dark:bg-charcoal-800 dark:text-gray-100 dark:hover:border-teal-500/50 dark:hover:bg-charcoal-700',
                      )}
                    >
                      <span className="truncate">{model.name}</span>
                      {isActive ? (
                        <Check size={16} className="text-teal-500 dark:text-teal-300" />
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
    </div>
  );
};

export default QuickModelSelector;
