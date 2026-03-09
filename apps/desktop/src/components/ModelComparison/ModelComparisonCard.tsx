/**
 * ModelComparisonCard
 *
 * Individual model response card for side-by-side comparison.
 * Shows model name, latency, token count, cost, and streaming response.
 */
import React from 'react';
import { Brain, Clock, Coins, Hash, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getModelMetadata } from '../../constants/llm';

export interface ComparisonResult {
  modelId: string;
  content: string;
  isStreaming: boolean;
  isComplete: boolean;
  error?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

interface ModelComparisonCardProps {
  result: ComparisonResult;
  index: number;
}

const CARD_ACCENT_COLORS = [
  'border-blue-500/40 bg-blue-500/5',
  'border-violet-500/40 bg-violet-500/5',
  'border-emerald-500/40 bg-emerald-500/5',
];

const HEADER_ACCENT_COLORS = ['text-blue-400', 'text-violet-400', 'text-emerald-400'];

export const ModelComparisonCard: React.FC<ModelComparisonCardProps> = ({ result, index }) => {
  const metadata = getModelMetadata(result.modelId);
  const displayName = metadata?.name ?? result.modelId;
  const accentBorder = CARD_ACCENT_COLORS[index % CARD_ACCENT_COLORS.length];
  const accentText = HEADER_ACCENT_COLORS[index % HEADER_ACCENT_COLORS.length];

  const formatCost = (cost?: number): string => {
    if (cost === undefined) return '—';
    if (cost < 0.001) return `<$0.001`;
    return `$${cost.toFixed(4)}`;
  };

  const formatLatency = (ms?: number): string => {
    if (ms === undefined) return '—';
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-[#0c0e18] transition-all',
        accentBorder,
        'min-h-[300px] flex-1',
      )}
    >
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-gray-800/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain size={14} className={accentText} />
          <span className={cn('text-sm font-semibold', accentText)}>{displayName}</span>
          {metadata?.provider && (
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400 capitalize">
              {metadata.provider}
            </span>
          )}
        </div>
        {result.isStreaming && !result.isComplete && (
          <Loader2 size={13} className="animate-spin text-gray-400" />
        )}
      </div>

      {/* Metrics bar */}
      {(result.isComplete || result.isStreaming) && !result.error && (
        <div className="flex items-center gap-4 border-b border-gray-800/40 px-4 py-2">
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <Clock size={10} />
            <span>{formatLatency(result.latencyMs)}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <Hash size={10} />
            <span>{result.outputTokens !== undefined ? `${result.outputTokens} tok` : '—'}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <Coins size={10} />
            <span>{formatCost(result.costUsd)}</span>
          </div>
        </div>
      )}

      {/* Response content */}
      <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-200 leading-relaxed">
        {result.error ? (
          <div className="flex items-start gap-2 text-red-400">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span className="text-xs">{result.error}</span>
          </div>
        ) : result.isStreaming || result.isComplete ? (
          <div className="whitespace-pre-wrap">
            {result.content}
            {result.isStreaming && !result.isComplete && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-gray-400" />
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-600 text-xs">
            Waiting for response...
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelComparisonCard;
