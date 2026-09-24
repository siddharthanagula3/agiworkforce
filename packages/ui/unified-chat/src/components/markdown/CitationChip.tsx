import { createContext, useContext, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Globe } from 'lucide-react';
import { cn } from '../../lib/utils';
import { citationPublisherDomain } from './citationPublisher';

export interface MarkdownCitation {
  url: string;
  title?: string;
  favicon?: string;
  siteName?: string;
  snippet?: string;
  publishedDate?: string;
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

function citationHost(citation: MarkdownCitation): string {
  return citationPublisherDomain(citation) ?? citation.url;
}

function citationFaviconSrc(citation: MarkdownCitation): string | undefined {
  if (citation.favicon) return citation.favicon;
  // The publisher's domain, not the URL's host. A grounded result's URL host is
  // the routing vendor, so drawing from it gave every source in an answer the
  // same favicon.
  const domain = citationPublisherDomain(citation);
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined;
}

function citationSiteName(citation: MarkdownCitation): string {
  return citation.siteName || citationHost(citation);
}

const SNIPPET_MAX_CHARS = 180;

function citationSnippet(citation: MarkdownCitation): string | undefined {
  const trimmed = citation.snippet?.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > SNIPPET_MAX_CHARS
    ? `${trimmed.slice(0, SNIPPET_MAX_CHARS).trimEnd()}\u2026`
    : trimmed;
}

// Backends report this field in their own shape: an ISO instant from one, a
// relative phrase from another, so only a parseable value is reformatted.
function citationPublishedLabel(citation: MarkdownCitation): string | undefined {
  const raw = citation.publishedDate?.trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.length > 32 ? undefined : raw;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
  const host = citationHost(citation);
  const label = citation.title || citationSiteName(citation);
  const snippet = citationSnippet(citation);
  const published = citationPublishedLabel(citation);
  return (
    <div className="flex items-start gap-1.5">
      <CitationFavicon
        citation={citation}
        imgClassName="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-detail object-contain"
        fallbackClassName="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]"
      />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          <span className="sr-only">{`Source ${index}: `}</span>
          {label}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[var(--chat-text-secondary)]">
          <span className="truncate">{host}</span>
          {published && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span className="shrink-0 whitespace-nowrap">{published}</span>
            </>
          )}
        </span>
        {snippet && (
          <span className="mt-1 block text-[var(--chat-text-secondary)]" data-citation-snippet="">
            {snippet}
          </span>
        )}
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
            'px-2 text-caption font-medium text-[var(--chat-text-secondary)] no-underline',
            'transition-colors duration-instant hover:bg-[var(--chat-surface-elevated)] hover:text-[var(--chat-text-primary)]',
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
            'z-[var(--z-dropdown)] flex max-w-[320px] flex-col gap-2 rounded-lg border px-3 py-2 text-caption',
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
