import { ChevronDown, ChevronUp, FileSearch, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ToolResultProps } from './index';

interface DocumentSearchMatch {
  page?: number;
  line?: number;
  context: string;
  match_text: string;
}

interface DocumentSearchData {
  query?: string;
  file_path?: string;
  filePath?: string;
  count?: number;
  results?: DocumentSearchMatch[];
  success?: boolean;
  error?: string;
}

function highlightContext(context: string, matchText: string): React.ReactNode {
  if (!matchText) return context;
  const lowerContext = context.toLowerCase();
  const lowerMatch = matchText.toLowerCase();
  const start = lowerContext.indexOf(lowerMatch);
  if (start === -1) return context;
  const end = start + matchText.length;

  return (
    <>
      {context.slice(0, start)}
      <mark className="bg-amber-500/20 text-amber-300 px-0.5 rounded-sm">
        {context.slice(start, end)}
      </mark>
      {context.slice(end)}
    </>
  );
}

export const InlineDocumentSearch: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const data = result?.data as DocumentSearchData | undefined;
  const results = useMemo(() => data?.results || [], [data?.results]);

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
        <span className="text-sm text-muted-foreground">Searching document...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error' || data?.success === false) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <p className="text-sm text-red-300 font-medium">Document search failed</p>
        <p className="text-xs text-muted-foreground mt-1">{result?.error || data?.error}</p>
      </div>
    );
  }

  if (!data) return null;

  const query = data.query || '';
  const filePath = data.filePath || data.file_path || '';
  const visibleMatches = expanded ? results : results.slice(0, 5);

  return (
    <div className="mt-3 rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileSearch className="h-4 w-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">
              {results.length} match{results.length === 1 ? '' : 'es'}
            </span>
          </div>

          {results.length > 5 && (
            <button type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {expanded ? 'Show less' : `Show more (${results.length - 5})`}
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {query && <p className="mt-1 text-xs text-muted-foreground">Query: {query}</p>}
        {filePath && (
          <p className="mt-1 text-[11px] text-muted-foreground break-all" title={filePath}>
            {filePath}
          </p>
        )}
      </div>

      <div className="max-h-96 overflow-auto divide-y divide-border/20">
        {visibleMatches.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">No matches found.</div>
        ) : (
          visibleMatches.map((match, index) => (
            <div key={`${match.page ?? 'p'}-${match.line ?? 'l'}-${index}`} className="px-3 py-2.5">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                {typeof match.page === 'number' && <span>Page {match.page}</span>}
                {typeof match.line === 'number' && <span>Line {match.line}</span>}
              </div>
              <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                {highlightContext(match.context || '', match.match_text || '')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
