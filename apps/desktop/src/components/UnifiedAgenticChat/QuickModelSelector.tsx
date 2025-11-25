import { invoke } from '@/lib/tauri-mock';
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
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '../ui/Select';

type QuickModelSelectorProps = {
  className?: string;
};

type RouterSuggestion = {
  provider: Provider;
  model: string;
  reason: string;
};

export const QuickModelSelector = ({ className }: QuickModelSelectorProps) => {
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

    // Initialize groups for all providers
    allProviders.forEach((p) => {
      groups[p] = [];
    });

    // Helper to add model to group
    const addModel = (metadata: ModelMetadata) => {
      const providerGroup = groups[metadata.provider];
      if (providerGroup) {
        // Avoid duplicates
        if (!providerGroup.some((m) => m.id === metadata.id)) {
          providerGroup.push(metadata);
        }
      }
    };

    // Add models from all providers
    allProviders.forEach((provider) => {
      getProviderModels(provider).forEach(addModel);
    });

    // Also ensure favorites/recent are included if they might be missing from default lists
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
  };

  const suggestedMetadata = suggestion ? getModelMetadata(suggestion.model) : null;

  return (
    <div className={cn('flex w-full max-w-[280px] flex-col gap-2', className)}>
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
        <SelectContent className="max-h-[300px]">
          {Object.entries(modelGroups).map(([provider, models]) => {
            if (models.length === 0) return null;
            return (
              <SelectGroup key={provider}>
                <SelectLabel>{PROVIDER_LABELS[provider as Provider]}</SelectLabel>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};
