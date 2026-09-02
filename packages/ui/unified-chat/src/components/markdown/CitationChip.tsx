import { createContext, useContext, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface MarkdownCitation {
  url: string;
  title?: string;
  favicon?: string;
}

const NO_CITATIONS: readonly MarkdownCitation[] = [];

export const CitationsContext = createContext<readonly MarkdownCitation[]>(NO_CITATIONS);

export function useMarkdownCitations(): readonly MarkdownCitation[] {
  return useContext(CitationsContext);
}

function citationHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function citationFavicon(citation: MarkdownCitation): string | undefined {
  if (citation.favicon) return citation.favicon;
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(citation.url).hostname}&sz=32`;
  } catch {
    return undefined;
  }
}

export function CitationChip({ index, citation }: { index: number; citation: MarkdownCitation }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const host = citationHost(citation.url);
  const favicon = citationFavicon(citation);
  const label = citation.title || host;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Source ${index}: ${label}`}
          className={cn(
            'mx-0.5 inline-flex h-[15px] min-w-[15px] -translate-y-[1px] items-center justify-center',
            'rounded-full px-[3px] align-super text-[10px] font-semibold no-underline',
            'bg-[var(--chat-accent-secondary)] text-[var(--chat-accent-on-secondary)]',
            'transition-opacity duration-100 hover:opacity-80',
          )}
        >
          {index}
        </a>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className={cn(
            'z-50 max-w-[280px] rounded-lg border px-3 py-2 text-[12px]',
            'bg-[var(--chat-surface-overlay)] text-[var(--chat-text-primary)]',
            'border-[var(--chat-border)] shadow-[var(--chat-shadow-lg)]',
          )}
        >
          <span className="flex items-center gap-1.5">
            {favicon && !faviconFailed ? (
              <img
                src={favicon}
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
                className="h-3.5 w-3.5 shrink-0 rounded-[2px] object-contain"
                onError={() => setFaviconFailed(true)}
              />
            ) : (
              <Globe
                className="h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]"
                aria-hidden="true"
              />
            )}
            <span className="truncate font-medium">{label}</span>
          </span>
          <span className="mt-0.5 block truncate text-[var(--chat-text-secondary)]">{host}</span>
          <Tooltip.Arrow className="fill-[var(--chat-surface-overlay)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
