import { Store, Star, Loader2, AlertCircle, Download, Tag } from 'lucide-react';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { cn } from '@/lib/utils';

interface MarketplaceData {
  id?: string;
  name?: string;
  author?: string;
  rating?: number;
  category?: string;
  installCount?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  automation: 'bg-blue-500/20 text-blue-300',
  productivity: 'bg-emerald-500/20 text-emerald-300',
  research: 'bg-purple-500/20 text-purple-300',
  development: 'bg-amber-500/20 text-amber-300',
  communication: 'bg-pink-500/20 text-pink-300',
};

function StarRating({ rating }: { rating: number }) {
  const clamped = Math.min(5, Math.max(0, rating));
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < full
              ? 'text-amber-400 fill-amber-400'
              : i === full && half
                ? 'text-amber-400 fill-amber-400/50'
                : 'text-zinc-600',
          )}
        />
      ))}
      <span className="ml-1 text-xs text-zinc-400">{clamped.toFixed(1)}</span>
    </div>
  );
}

export function InlineMarketplaceCard({ result, status, onExpand }: ToolResultProps) {
  const data = result?.data as MarketplaceData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Loading marketplace item...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Marketplace fetch failed</p>
          {result?.error && <p className="text-xs text-zinc-500 mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { name = 'Workflow', author, rating = 0, category, installCount } = data;
  const catClass =
    category && CATEGORY_COLORS[category.toLowerCase()]
      ? CATEGORY_COLORS[category.toLowerCase()]
      : 'bg-zinc-500/20 text-zinc-300';

  const formattedCount =
    installCount !== undefined
      ? installCount >= 1000
        ? `${(installCount / 1000).toFixed(1)}k`
        : String(installCount)
      : undefined;

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800/60 border-b border-white/10">
        <Store className="h-4 w-4 text-indigo-400 shrink-0" />
        <span className="text-sm font-medium text-zinc-200 flex-1 truncate">{name}</span>
        {category && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1',
              catClass,
            )}
          >
            <Tag className="h-2.5 w-2.5" />
            {category}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {author && <p className="text-xs text-zinc-500">by {author}</p>}

        <div className="flex items-center justify-between">
          <StarRating rating={rating} />
          {formattedCount && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Download className="h-3 w-3" />
              {formattedCount} installs
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onExpand?.('install-template')}
            className="h-7 flex-1 gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40"
          >
            <Download className="h-3 w-3" />
            Install
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onExpand?.('clone-template')}
            className="h-7 flex-1 gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Clone
          </Button>
        </div>
      </div>
    </div>
  );
}
