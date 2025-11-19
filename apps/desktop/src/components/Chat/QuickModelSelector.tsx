import { useMemo } from 'react';
import type { Provider } from '../../stores/settingsStore';
import {
  getModelMetadata,
  getProviderModels,
  formatCost,
  PROVIDER_LABELS,
  type ModelMetadata,
} from '../../constants/llm';
import { useModelStore } from '../../stores/modelStore';
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

type QuickModelSelectorProps = {
  className?: string;
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

    return Array.from(map.values());
  }, [activeProvider, favorites, recentModels]);

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

  return (
    <Select value={selectedModel ?? undefined} onValueChange={handleModelChange}>
      <SelectTrigger className={cn('w-[220px] text-sm', className)} aria-label="Select model">
        <SelectValue placeholder="Choose model" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{PROVIDER_LABELS[activeProvider]}</SelectLabel>
          {modelOptions.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {`${model.name} • ${formatCost(model.inputCost, model.outputCost)}`}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
