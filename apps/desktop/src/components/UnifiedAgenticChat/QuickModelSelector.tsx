import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Provider } from '../../stores/settingsStore';
import {
  getModelMetadata,
  getProviderModels,
  formatCost,
  PROVIDER_LABELS,
  type ModelMetadata,
} from '../../constants/llm';
import { useModelStore } from '../../stores/modelStore';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { cn } from '../../lib/utils';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { Button } from '../ui/Button';

type QuickModelSelectorProps = {
  className?: string;
};

type RouterSuggestion = {
  provider: Provider;
  model: string;
  reason: string;
};

const DEFAULT_PROVIDER: Provider = 'openai';

export const QuickModelSelector = ({ className }: QuickModelSelectorProps) => {
  const { selectedModel, selectedProvider, favorites, recentModels, selectModel } = useModelStore(
    (state) => ({
      selectedModel: state.selectedModel,
      selectedProvider: state.selectedProvider,
      favorites: state.favorites,
      recentModels: state.recentModels,
      selectModel: state.selectModel,
    }),
  );
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

  const activeProvider: Provider = useMemo(() => {
    const selectedMetadata = selectedModel ? getModelMetadata(selectedModel) : null;
    if (selectedMetadata?.provider) {
      return selectedMetadata.provider;
    }

    if (selectedProvider) {
      return selectedProvider;
    }

    const favoriteProvider = favorites
      .map((id) => getModelMetadata(id))
      .find((model): model is NonNullable<typeof model> => Boolean(model))?.provider;
    if (favoriteProvider) {
      return favoriteProvider;
    }

    return DEFAULT_PROVIDER;
  }, [selectedModel, selectedProvider, favorites]);

  const modelOptions = useMemo(() => {
    const map = new Map<string, ModelMetadata>();

    const addModel = (id: string | null | undefined) => {
      if (!id) {
        return;
      }
      const metadata = getModelMetadata(id);
      if (metadata) {
        map.set(metadata.id, metadata);
      }
    };

    favorites.forEach(addModel);
    recentModels.forEach(addModel);
    getProviderModels(activeProvider).forEach((metadata) => {
      map.set(metadata.id, metadata);
    });

    if (suggestion) {
      const suggestedMetadata = getModelMetadata(suggestion.model);
      if (suggestedMetadata) {
        map.set(suggestedMetadata.id, suggestedMetadata);
      }
    }

    return Array.from(map.values());
  }, [activeProvider, favorites, recentModels, suggestion]);

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
  };

  if (modelOptions.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground',
          className,
        )}
      >
        No models available
      </div>
    );
  }

  const suggestedMetadata = suggestion ? getModelMetadata(suggestion.model) : null;

  return (
    <div className={cn('flex w-full max-w-[220px] flex-col gap-2', className)}>
      {suggestion && suggestedMetadata && (
        <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                Recommended
              </p>
              <p className="text-sm font-medium text-foreground">
                {suggestedMetadata.name}{' '}
                <span className="text-muted-foreground">
                  ({PROVIDER_LABELS[suggestion.provider]})
                </span>
              </p>
              <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {suggestion.reason}
              </p>
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
        </div>
      )}
      <Select value={selectedModel ?? undefined} onValueChange={handleModelChange}>
        <SelectTrigger className="w-full text-sm" aria-label="Select model">
          <SelectValue placeholder="Choose model" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{PROVIDER_LABELS[activeProvider]}</SelectLabel>
            {modelOptions.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {`${model.name} - ${formatCost(model.inputCost, model.outputCost)}`}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
