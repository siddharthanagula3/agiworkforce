import { createContext, useContext, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Globe } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface MarkdownCitation {
  url: string;
  title?: string;
  favicon?: string;
  siteName?: string;
}

export interface CitationItem {
  index: number;
  citation: MarkdownCitation;
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

function citationFaviconSrc(citation: MarkdownCitation): string | undefined {
  if (citation.favicon) return citation.favicon;
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(citation.url).hostname}&sz=32`;
  } catch {
    return undefined;
  }
}

function citationSiteName(citation: MarkdownCitation): string {
  return citation.siteName || citationHost(citation.url);
}

function CitationFavicon({
  citation,
  imgClassName,
  fallbackClassName,
}: {
  citation: MarkdownCitation;
  imgClassName: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = citationFaviconSrc(citation);

  if (!src || failed) {
    return <Globe className={fallbackClassName} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={14}
      height={14}
      className={imgClassName}
      onError={() => setFailed(true)}
    />
  );
}

function TooltipSourceRow({ index, citation }: CitationItem) {
  const host = citationHost(citation.url);
  const label = citation.title || citationSiteName(citation);
  return (
    <div className="flex items-start gap-1.5">
      <CitationFavicon
        citation={citation}
        imgClassName="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[2px] object-contain"
        fallbackClassName="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]"
      />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          <span className="sr-only">{`Source ${index}: `}</span>
          {label}
        </span>
        <span className="block truncate text-[var(--chat-text-secondary)]">{host}</span>
      </span>
    </div>
  );
}

export function CitationChip({ items }: { items: readonly CitationItem[] }) {
  const first = items[0];
  if (!first) return null;

  const extraCount = items.length - 1;
  const siteName = citationSiteName(first.citation);
  const ariaLabel =
    items.length === 1
      ? `Source ${first.index}: ${first.citation.title || siteName}`
      : `Sources ${items.map((item) => item.index).join(', ')}: ${items
          .map((item) => citationSiteName(item.citation))
          .join(', ')}`;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <a
          href={first.citation.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel}
          className={cn(
            'mx-0.5 inline-flex h-6 max-w-[9.5rem] items-center gap-1 align-middle',
            'rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-hover)]',
            'px-2 text-[12px] font-medium text-[var(--chat-text-secondary)] no-underline',
            'transition-colors duration-100 hover:bg-[var(--chat-surface-elevated)] hover:text-[var(--chat-text-primary)]',
          )}
        >
          <CitationFavicon
            citation={first.citation}
            imgClassName="h-3.5 w-3.5 shrink-0 rounded-full object-contain"
            fallbackClassName="h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]"
          />
          <span className="truncate">{siteName}</span>
          {extraCount > 0 && <span className="shrink-0">{`+${extraCount}`}</span>}
        </a>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className={cn(
            'z-50 flex max-w-[280px] flex-col gap-2 rounded-lg border px-3 py-2 text-[12px]',
            'bg-[var(--chat-surface-overlay)] text-[var(--chat-text-primary)]',
            'border-[var(--chat-border)] shadow-[var(--chat-shadow-lg)]',
          )}
        >
          {items.map((item) => (
            <TooltipSourceRow key={item.index} index={item.index} citation={item.citation} />
          ))}
          <Tooltip.Arrow className="fill-[var(--chat-surface-overlay)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
