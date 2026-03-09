/**
 * ComparisonControls
 *
 * Controls for the Model Comparison view.
 * Includes prompt textarea, model selector dropdowns, and Compare button.
 */
import React, { useState, useMemo } from 'react';
import { GitCompareArrows, PlusCircle, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { getModelMetadata, PROVIDER_LABELS, PROVIDERS_IN_ORDER } from '../../constants/llm';
import { useModelStore } from '../../stores/modelStore';
import { Button } from '../ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import type { Provider } from '../../types/provider';

interface ComparisonControlsProps {
  selectedModels: string[];
  prompt: string;
  isComparing: boolean;
  onPromptChange: (prompt: string) => void;
  onModelsChange: (models: string[]) => void;
  onCompare: () => void;
}

const MAX_MODELS = 3;
const MIN_MODELS = 2;

export const ComparisonControls: React.FC<ComparisonControlsProps> = ({
  selectedModels,
  prompt,
  isComparing,
  onPromptChange,
  onModelsChange,
  onCompare,
}) => {
  const { availableModels, getAvailableModels } = useModelStore(
    useShallow((state) => ({
      availableModels: state.availableModels,
      getAvailableModels: state.getAvailableModels,
    })),
  );

  const [hasLoaded, setHasLoaded] = useState(false);

  React.useEffect(() => {
    if (!hasLoaded && availableModels.length === 0) {
      setHasLoaded(true);
      void getAvailableModels();
    }
  }, [hasLoaded, availableModels.length, getAvailableModels]);

  // Build flat model option list grouped by provider
  const modelOptions = useMemo(() => {
    const options: { id: string; name: string; provider: Provider }[] = [];
    PROVIDERS_IN_ORDER.forEach((provider) => {
      const providerModels = availableModels
        .filter((m) => m.provider === provider)
        .map((m) => {
          const meta = getModelMetadata(m.id);
          return { id: m.id, name: meta?.name ?? m.name, provider };
        });
      options.push(...providerModels);
    });
    return options;
  }, [availableModels]);

  const handleModelChange = (index: number, modelId: string) => {
    const updated = [...selectedModels];
    updated[index] = modelId;
    onModelsChange(updated);
  };

  const handleAddModel = () => {
    if (selectedModels.length >= MAX_MODELS) return;
    // Pick first model not already selected
    const next = modelOptions.find((m) => !selectedModels.includes(m.id));
    onModelsChange([...selectedModels, next?.id ?? modelOptions[0]?.id ?? '']);
  };

  const handleRemoveModel = (index: number) => {
    if (selectedModels.length <= MIN_MODELS) return;
    const updated = selectedModels.filter((_, i) => i !== index);
    onModelsChange(updated);
  };

  const canCompare = prompt.trim().length > 0 && selectedModels.every(Boolean) && !isComparing;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-[#0c0e18] p-4">
      {/* Model selectors */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-400 shrink-0">Compare models:</span>
        {selectedModels.map((modelId, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <Select
              value={modelId}
              onValueChange={(val) => handleModelChange(idx, val)}
              disabled={isComparing}
            >
              <SelectTrigger className="h-8 w-48 border-gray-700 bg-gray-900 text-xs text-gray-200">
                <SelectValue placeholder="Select model...">
                  {modelId ? (getModelMetadata(modelId)?.name ?? modelId) : 'Select model...'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72 bg-gray-900 border-gray-700">
                {PROVIDERS_IN_ORDER.map((provider) => {
                  const providerModels = modelOptions.filter((m) => m.provider === provider);
                  if (providerModels.length === 0) return null;
                  return (
                    <React.Fragment key={provider}>
                      <div className="px-2 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {PROVIDER_LABELS[provider]}
                      </div>
                      {providerModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs text-gray-200">
                          {m.name}
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedModels.length > MIN_MODELS && (
              <button
                type="button"
                onClick={() => handleRemoveModel(idx)}
                disabled={isComparing}
                className="text-gray-600 hover:text-red-400 transition-colors"
                aria-label="Remove model"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {selectedModels.length < MAX_MODELS && (
          <button
            type="button"
            onClick={handleAddModel}
            disabled={isComparing || modelOptions.length === 0}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
          >
            <PlusCircle size={13} />
            <span>Add model</span>
          </button>
        )}
      </div>

      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={isComparing}
        placeholder="Enter a prompt to compare across models..."
        rows={3}
        className={cn(
          'w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2',
          'text-sm text-gray-200 placeholder:text-gray-600',
          'focus:border-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600',
          'disabled:opacity-50',
        )}
      />

      {/* Compare button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
        </span>
        <Button
          onClick={onCompare}
          disabled={!canCompare}
          size="sm"
          className="flex items-center gap-2"
        >
          <GitCompareArrows size={14} />
          {isComparing ? 'Comparing...' : 'Compare'}
        </Button>
      </div>
    </div>
  );
};

export default ComparisonControls;
