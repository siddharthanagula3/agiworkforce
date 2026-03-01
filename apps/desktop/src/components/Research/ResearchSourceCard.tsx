/**
 * ResearchSourceCard
 *
 * Card for each research source showing:
 * - Favicon + domain name
 * - Title (truncated to 2 lines)
 * - Snippet text
 * - Relevance badge (green >0.8, yellow >0.5, red <0.5)
 * - External link icon (opens in browser via shell)
 */
import { memo } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { openUrl } from '@/lib/tauri-mock';
import { cn } from '@/lib/utils';

/** Source shape matching the live research event payload and ResearchProgressPanel */
export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
}

export interface ResearchSourceCardProps {
  source: ResearchSource;
  index?: number;
  className?: string;
}

export const ResearchSourceCard = memo(function ResearchSourceCard({
  source,
  index,
  className,
}: ResearchSourceCardProps) {
  const domain = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      return source.url;
    }
  })();

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  const relevancePercent = Math.round(source.relevanceScore * 100);

  const relevanceBadgeClass =
    source.relevanceScore >= 0.8
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : source.relevanceScore >= 0.5
        ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
        : 'bg-red-500/15 text-red-400 border-red-500/30';

  const handleOpen = () => {
    if (source.url) {
      void openUrl(source.url);
    }
  };

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-white/20 hover:bg-white/8',
        className,
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        {/* Index badge */}
        {index !== undefined && (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-400">
            {index + 1}
          </span>
        )}

        {/* Favicon + domain */}
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          <img
            src={faviconUrl}
            alt=""
            className="h-4 w-4 shrink-0 rounded-sm"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'block';
            }}
          />
          <Globe className="hidden h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate text-xs text-slate-400">{domain}</span>
        </div>

        {/* Relevance badge */}
        <span
          className={cn(
            'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            relevanceBadgeClass,
          )}
        >
          {relevancePercent}%
        </span>
      </div>

      {/* Title */}
      <p className="line-clamp-2 text-sm font-medium text-white leading-snug">
        {source.title || domain}
      </p>

      {/* Snippet */}
      {source.snippet && (
        <p className="line-clamp-3 text-xs text-slate-400 leading-relaxed">{source.snippet}</p>
      )}

      {/* Footer: external link */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1 self-start rounded text-xs text-slate-500 transition hover:text-indigo-400"
        aria-label={`Open ${source.title || domain} in browser`}
      >
        <ExternalLink className="h-3 w-3" />
        Open source
      </button>
    </div>
  );
});
