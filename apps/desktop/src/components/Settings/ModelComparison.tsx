import React, { useState } from 'react';
import { X, Plus, TrendingUp, DollarSign, Zap, Award } from 'lucide-react';
import type { ModelMetadata } from '../../constants/llm';
import { getAllModels, formatCost, PROVIDER_LABELS } from '../../constants/llm';
import { cn } from '../../lib/utils';

interface ModelComparisonProps {
  initialModels?: string[];
  maxModels?: number;
  className?: string;
}

export const ModelComparison: React.FC<ModelComparisonProps> = ({
  initialModels = [],
  maxModels = 3,
  className,
}) => {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(initialModels);
  const [isSelectingModel, setIsSelectingModel] = useState(false);

  const allModels = getAllModels();
  const selectedModels = selectedModelIds
    .map((id) => allModels.find((m) => m.id === id))
    .filter(Boolean) as ModelMetadata[];

  const availableModels = allModels.filter((m) => !selectedModelIds.includes(m.id));

  const addModel = (modelId: string) => {
    if (selectedModelIds.length < maxModels) {
      setSelectedModelIds([...selectedModelIds, modelId]);
      setIsSelectingModel(false);
    }
  };

  const removeModel = (modelId: string) => {
    setSelectedModelIds(selectedModelIds.filter((id) => id !== modelId));
  };

  const ComparisonRow = ({
    label,
    icon: Icon,
    getValue,
    format = (v) => String(v),
    highlight = false,
  }: {
    label: string;
    icon?: React.ElementType;
    getValue: (model: ModelMetadata) => any;
    format?: (value: any) => string;
    highlight?: boolean;
  }) => (
    <div className="grid grid-cols-4 border-b border-gray-200 dark:border-gray-700">
      <div
        className={cn(
          'p-3 font-medium text-sm bg-gray-50 dark:bg-gray-800',
          'border-r border-gray-200 dark:border-gray-700',
          'flex items-center gap-2',
        )}
      >
        {Icon && <Icon className="h-4 w-4 text-gray-500" />}
        <span>{label}</span>
      </div>
      {selectedModels.map((model, index) => {
        const value = getValue(model);
        const isHighlighted = highlight && selectedModels.length > 1;

        // Determine if this is the best value for highlighting
        let isBest = false;
        if (isHighlighted) {
          const values = selectedModels.map(getValue);
          if (typeof value === 'number') {
            // For SWE-bench, HumanEval, MMLU - higher is better
            if (
              label.includes('SWE-bench') ||
              label.includes('HumanEval') ||
              label.includes('MMLU')
            ) {
              isBest = value === Math.max(...(values as number[]));
            }
            // For context window - higher is better
            else if (label.includes('Context')) {
              isBest = value === Math.max(...(values as number[]));
            }
            // For cost - lower is better
            else if (label.includes('Cost')) {
              isBest = value === Math.min(...(values as number[]));
            }
          }
        }

        return (
          <div
            key={`${model.id}-${index}`}
            className={cn(
              'p-3 text-sm',
              index < selectedModels.length - 1 && 'border-r border-gray-200 dark:border-gray-700',
              isBest && 'bg-green-50 dark:bg-green-900/20 font-semibold',
            )}
          >
            {format(value)}
          </div>
        );
      })}
      {Array.from({ length: maxModels - selectedModels.length }).map((_, index) => (
        <div
          key={`empty-${index}`}
          className={cn(
            'p-3',
            index < maxModels - selectedModels.length - 1 &&
              'border-r border-gray-200 dark:border-gray-700',
          )}
        />
      ))}
    </div>
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with Model Selection */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Model Comparison
        </h2>

        <div className="grid grid-cols-3 gap-3">
          {selectedModels.map((model) => (
            <div
              key={model.id}
              className="relative p-3 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/20"
            >
              <button
                onClick={() => removeModel(model.id)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {model.name}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                {PROVIDER_LABELS[model.provider]}
              </div>
            </div>
          ))}

          {selectedModels.length < maxModels && (
            <button
              onClick={() => setIsSelectingModel(true)}
              className="p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <Plus className="h-6 w-6 mx-auto text-gray-400" />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add Model</div>
            </button>
          )}
        </div>
      </div>

      {/* Comparison Table */}
      {selectedModels.length > 0 ? (
        <div className="flex-1 overflow-auto">
          <div className="min-w-full">
            {/* Basic Info */}
            <div className="mb-4">
              <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 font-semibold text-sm">
                Basic Information
              </div>
              <ComparisonRow
                label="Provider"
                getValue={(m) => PROVIDER_LABELS[m.provider]}
              />
              <ComparisonRow
                label="Release Date"
                getValue={(m) => m.released || 'Unknown'}
              />
              <ComparisonRow label="Speed" getValue={(m) => m.speed} />
              <ComparisonRow label="Quality" getValue={(m) => m.quality} />
            </div>

            {/* Performance */}
            <div className="mb-4">
              <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 font-semibold text-sm flex items-center gap-2">
                <Award className="h-4 w-4" />
                Performance & Benchmarks
              </div>
              <ComparisonRow
                label="Context Window"
                icon={TrendingUp}
                getValue={(m) => m.contextWindow}
                format={(v) => `${(v / 1000).toFixed(0)}K tokens`}
                highlight
              />
              {selectedModels.some((m) => m.benchmarks?.swebench) && (
                <ComparisonRow
                  label="SWE-bench Score"
                  getValue={(m) => m.benchmarks?.swebench ?? 0}
                  format={(v) => `${v.toFixed(1)}%`}
                  highlight
                />
              )}
              {selectedModels.some((m) => m.benchmarks?.humaneval) && (
                <ComparisonRow
                  label="HumanEval Score"
                  getValue={(m) => m.benchmarks?.humaneval ?? 0}
                  format={(v) => `${v.toFixed(1)}%`}
                  highlight
                />
              )}
              {selectedModels.some((m) => m.benchmarks?.mmlu) && (
                <ComparisonRow
                  label="MMLU Score"
                  getValue={(m) => m.benchmarks?.mmlu ?? 0}
                  format={(v) => `${v.toFixed(1)}%`}
                  highlight
                />
              )}
            </div>

            {/* Cost */}
            <div className="mb-4">
              <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 font-semibold text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Pricing (per 1M tokens)
              </div>
              <ComparisonRow
                label="Input Cost"
                getValue={(m) => m.inputCost}
                format={(v) => (v === 0 ? 'Free' : `$${v.toFixed(2)}`)}
                highlight
              />
              <ComparisonRow
                label="Output Cost"
                getValue={(m) => m.outputCost}
                format={(v) => (v === 0 ? 'Free' : `$${v.toFixed(2)}`)}
                highlight
              />
              <ComparisonRow
                label="Total (Avg)"
                getValue={(m) => (m.inputCost + m.outputCost) / 2}
                format={(v) => (v === 0 ? 'Free' : `$${v.toFixed(2)}`)}
                highlight
              />
            </div>

            {/* Capabilities */}
            <div className="mb-4">
              <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 font-semibold text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Capabilities
              </div>
              <ComparisonRow
                label="Streaming"
                getValue={(m) => m.capabilities.streaming}
                format={(v) => (v ? '✓' : '✗')}
              />
              <ComparisonRow
                label="Function Calling"
                getValue={(m) => m.capabilities.tools}
                format={(v) => (v ? '✓' : '✗')}
              />
              <ComparisonRow
                label="Vision"
                getValue={(m) => m.capabilities.vision}
                format={(v) => (v ? '✓' : '✗')}
              />
              <ComparisonRow
                label="JSON Mode"
                getValue={(m) => m.capabilities.json}
                format={(v) => (v ? '✓' : '✗')}
              />
            </div>

            {/* Best For */}
            <div className="mb-4">
              <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 font-semibold text-sm">
                Best Use Cases
              </div>
              <ComparisonRow
                label="Recommended For"
                getValue={(m) => m.bestFor.join(', ')}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
          <div className="text-center">
            <Plus className="h-12 w-12 mx-auto mb-3" />
            <p className="text-lg font-medium">No models selected</p>
            <p className="text-sm">Add up to {maxModels} models to compare</p>
          </div>
        </div>
      )}

      {/* Model Selection Modal */}
      {isSelectingModel && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Select Model to Compare</h3>
              <button
                onClick={() => setIsSelectingModel(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => addModel(model.id)}
                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <div className="font-medium">{model.name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                      {PROVIDER_LABELS[model.provider]} • {formatCost(model.inputCost, model.outputCost)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
