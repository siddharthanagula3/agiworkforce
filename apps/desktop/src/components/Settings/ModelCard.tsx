import React from 'react';
import {
  CheckCircle2,
  Zap,
  Eye,
  Wrench,
  FileJson,
  Star,
  TrendingUp,
  Clock,
  DollarSign,
} from 'lucide-react';
import type { ModelMetadata } from '../../constants/llm';
import { formatCost } from '../../constants/llm';
import { cn } from '../../lib/utils';

interface ModelCardProps {
  model: ModelMetadata;
  selected?: boolean;
  favorite?: boolean;
  onClick?: () => void;
  onToggleFavorite?: () => void;
  compact?: boolean;
  showBenchmarks?: boolean;
}

const speedIcons = {
  'very-fast': <Zap className="h-3 w-3 text-green-500" />,
  fast: <Zap className="h-3 w-3 text-blue-500" />,
  medium: <Clock className="h-3 w-3 text-yellow-500" />,
  slow: <Clock className="h-3 w-3 text-red-500" />,
};

const qualityColors = {
  excellent: 'text-green-600 dark:text-green-400',
  good: 'text-blue-600 dark:text-blue-400',
  fair: 'text-yellow-600 dark:text-yellow-400',
};

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  selected = false,
  favorite = false,
  onClick,
  onToggleFavorite,
  compact = false,
  showBenchmarks = false,
}) => {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.();
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          selected && 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500',
          !selected && 'border border-gray-200 dark:border-gray-700',
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-shrink-0">{speedIcons[model.speed]}</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{model.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{model.provider}</div>
          </div>
        </div>
        {onToggleFavorite && (
          <button
            onClick={handleFavoriteClick}
            className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <Star
              className={cn('h-4 w-4', favorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400')}
            />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'p-4 rounded-lg border-2 cursor-pointer transition-all',
        'hover:shadow-md hover:scale-[1.02]',
        selected && 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
        !selected && 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{model.name}</h3>
            {onToggleFavorite && (
              <button
                onClick={handleFavoriteClick}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <Star
                  className={cn(
                    'h-4 w-4',
                    favorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400',
                  )}
                />
              </button>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 capitalize">{model.provider}</div>
        </div>
        <div className="flex items-center gap-1">
          {speedIcons[model.speed]}
          <span className={cn('text-xs font-medium', qualityColors[model.quality])}>
            {model.quality}
          </span>
        </div>
      </div>

      {/* Context Window & Cost */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-gray-500" />
          <span className="text-gray-700 dark:text-gray-300">
            Context: {(model.contextWindow / 1000).toFixed(0)}K tokens
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-gray-500" />
          <span className="text-gray-700 dark:text-gray-300">
            {formatCost(model.inputCost, model.outputCost)}
          </span>
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-2 mb-3">
        {model.capabilities.streaming && (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/20 rounded text-xs">
            <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
            <span className="text-green-700 dark:text-green-300">Streaming</span>
          </div>
        )}
        {model.capabilities.tools && (
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 rounded text-xs">
            <Wrench className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <span className="text-blue-700 dark:text-blue-300">Tools</span>
          </div>
        )}
        {model.capabilities.vision && (
          <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/20 rounded text-xs">
            <Eye className="h-3 w-3 text-purple-600 dark:text-purple-400" />
            <span className="text-purple-700 dark:text-purple-300">Vision</span>
          </div>
        )}
        {model.capabilities.json && (
          <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/20 rounded text-xs">
            <FileJson className="h-3 w-3 text-orange-600 dark:text-orange-400" />
            <span className="text-orange-700 dark:text-orange-300">JSON</span>
          </div>
        )}
      </div>

      {/* Benchmarks */}
      {showBenchmarks && model.benchmarks && (
        <div className="space-y-1 mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Benchmarks
          </div>
          {model.benchmarks.swebench && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">SWE-bench:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {model.benchmarks.swebench.toFixed(1)}%
              </span>
            </div>
          )}
          {model.benchmarks.humaneval && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">HumanEval:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {model.benchmarks.humaneval.toFixed(1)}%
              </span>
            </div>
          )}
          {model.benchmarks.mmlu && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">MMLU:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {model.benchmarks.mmlu.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Best For */}
      <div className="text-xs text-gray-600 dark:text-gray-400">
        <span className="font-semibold">Best for:</span> {model.bestFor.join(', ')}
      </div>

      {/* Release Date */}
      {model.released && (
        <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">Released {model.released}</div>
      )}
    </div>
  );
};
