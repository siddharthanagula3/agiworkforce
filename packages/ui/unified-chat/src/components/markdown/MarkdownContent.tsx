import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';
import { MARKDOWN_SANITIZE_SCHEMA } from './markdownSanitizeSchema';
import { preprocessMath } from './preprocessMath';
import { reactNodeText } from './reactNodeText';
import { MermaidDiagram } from './MermaidDiagram';
import { HighlightedCode } from './HighlightedCode';
import { REMARK_PLUGINS } from './remarkPlugins';
import { StreamTailContext, useIsStreamTail } from './streamTailContext';
import {
  CITATION_GROUP_HREF_PATTERN,
  CITATION_HREF_PATTERN,
  findCitationIndexForUrl,
  linkifyCitationMarkers,
  stripTrackingParams,
} from './citationMarkers';
import { CitationChip, CitationsContext, useMarkdownCitations } from './CitationChip';
import type { CitationItem, MarkdownCitation } from './CitationChip';
import type { Components } from 'react-markdown';
import { Button } from '@agiworkforce/ui';
import { Copy, Check, ImageOff } from 'lucide-react';
import 'katex/dist/katex.min.css';
import './codeBlock.css';

const CodeBlock = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const isStreamTail = useIsStreamTail();
  const match = /language-(\w+)/.exec(className || '');
  const language = match?.[1] ?? '';
  const codeString = reactNodeText(children).replace(/\n$/, '');

  const [copyFailed, setCopyFailed] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 4000);
    }
  };

  if (language === 'mermaid') {
    return (
      <MermaidDiagram
        source={codeString}
        isStreaming={isStreamTail}
        className="mermaid-block my-4"
      />
    );
  }

  if (!match) {
    return (
      <code className="rounded-md bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[13px] font-mono text-gray-800 dark:text-gray-200">
        {children}
      </code>
    );
  }

  return (
    <div className="code-block-container group relative my-4">
      <div className="code-block-header-bar">
        <span className="code-block-lang-label">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1.5 px-2 text-xs text-[var(--chat-code-lang-label)] hover:text-[var(--chat-code-copy-hover-fg)] hover:bg-[var(--chat-code-copy-hover-bg)]"
          aria-label={copyFailed ? 'Copying code failed' : copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          {copyFailed ? 'Copy failed' : copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="code-block-body">
        <pre>
          <HighlightedCode
            code={codeString}
            language={language}
            enabled={!isStreamTail}
            className={className}
          />
        </pre>
      </div>
    </div>
  );
};

function isNavigableImageSource(src: string): boolean {
  const trimmed = src.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (!scheme) return true;
  const protocol = (scheme[1] ?? '').toLowerCase();
  return protocol === 'http' || protocol === 'https';
}

const IMAGE_LOADING_PLACEHOLDER_CLASS = 'aspect-[4/3] w-full max-w-sm';

const MarkdownImage = ({ src, alt, title }: { src?: string; alt?: string; title?: string }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  if (!src) return null;

  if (status === 'error') {
    return (
      <span
        className="my-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        role="img"
        aria-label={alt ? `Image failed to load: ${alt}` : 'Image failed to load'}
      >
        <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{alt || 'Image failed to load'}</span>
      </span>
    );
  }

  const navigable = isNavigableImageSource(src);

  const picture = (
    <>
      {status === 'loading' && (
        <span
          className="absolute inset-0 animate-pulse rounded-lg bg-muted/50"
          aria-hidden="true"
        />
      )}
      {/* Data/blob and arbitrary remote sources cannot use a host-specific
          image optimizer safely, so this renderer intentionally uses img. */}
      <img
        src={src}
        alt={alt || ''}
        title={title}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={cn(
          'max-h-[512px] max-w-full rounded-lg border border-border/50 object-contain',
          navigable && 'cursor-zoom-in',
        )}
      />
    </>
  );

  const wrapperClassName = cn(
    'relative my-2 inline-block max-w-full align-top',
    status === 'loading' && IMAGE_LOADING_PLACEHOLDER_CLASS,
  );

  if (!navigable) {
    return (
      <span className={wrapperClassName} title={title || alt}>
        {picture}
      </span>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(wrapperClassName, 'no-underline')}
      title={title || alt || 'Open image in a new tab'}
      aria-label={alt ? `Open image in a new tab: ${alt}` : 'Open image in a new tab'}
    >
      {picture}
    </a>
  );
};

const PROTOCOL_RELATIVE_PREFIX = '//';
const FRAGMENT_PREFIX = '#';
const PAREN_OPEN_TAIL = /\(\s*$/;
const PAREN_CLOSE_HEAD = /^\s*\)/;

function citationItemsForIndices(
  indices: readonly number[],
  citations: readonly MarkdownCitation[],
): CitationItem[] {
  const items: CitationItem[] = [];
  for (const index of indices) {
    const citation = citations[index - 1];
    if (citation) items.push({ index, citation });
  }
  return items;
}

function isCitationLinkElement(
  node: React.ReactNode,
  citations: readonly MarkdownCitation[],
): boolean {
  if (!React.isValidElement(node) || node.type !== MarkdownLink) return false;
  const href = (node.props as { href?: unknown }).href;
  if (typeof href !== 'string') return false;

  const groupMatch = CITATION_GROUP_HREF_PATTERN.exec(href);
  if (groupMatch) {
    const indices = (groupMatch[1] ?? '').split(',').map(Number);
    return citationItemsForIndices(indices, citations).length > 0;
  }
  const citationMatch = CITATION_HREF_PATTERN.exec(href);
  if (citationMatch) {
    return citations[Number(citationMatch[1]) - 1] !== undefined;
  }
  return findCitationIndexForUrl(href, citations) !== undefined;
}

function unwrapCitationParens(
  children: React.ReactNode,
  citations: readonly MarkdownCitation[],
): React.ReactNode {
  const nodes = React.Children.toArray(children);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (isCitationLinkElement(node, citations)) {
      const prev = out[out.length - 1];
      const next = nodes[i + 1];
      if (typeof prev === 'string' && typeof next === 'string') {
        const openMatch = PAREN_OPEN_TAIL.exec(prev);
        const closeMatch = PAREN_CLOSE_HEAD.exec(next);
        if (openMatch && closeMatch) {
          out[out.length - 1] = prev.slice(0, prev.length - openMatch[0].length);
          nodes[i + 1] = next.slice(closeMatch[0].length);
        }
      }
    }
    out.push(node);
  }
  return out;
}

const MarkdownLink = ({ href, children }: { href?: string; children?: React.ReactNode }) => {
  const citations = useMarkdownCitations();
  // The sanitizer strips an href it refuses (javascript:, data:) but leaves
  // the anchor behind, and a protocol-relative href passes it untouched while
  // resolving to another origin. Neither may reach the reader as a link.
  if (typeof href !== 'string' || href.startsWith(PROTOCOL_RELATIVE_PREFIX)) {
    return <>{children}</>;
  }
  const groupMatch = CITATION_GROUP_HREF_PATTERN.exec(href);
  if (groupMatch) {
    const indices = (groupMatch[1] ?? '').split(',').map(Number);
    const items = citationItemsForIndices(indices, citations);
    if (items.length > 0) return <CitationChip items={items} />;
  } else {
    const citationMatch = CITATION_HREF_PATTERN.exec(href);
    if (citationMatch) {
      const index = Number(citationMatch[1]);
      const citation = citations[index - 1];
      if (citation) return <CitationChip items={[{ index, citation }]} />;
    } else {
      const inlineIndex = findCitationIndexForUrl(href, citations);
      if (inlineIndex !== undefined) {
        const citation = citations[inlineIndex - 1];
        if (citation) return <CitationChip items={[{ index: inlineIndex, citation }]} />;
      }
    }
  }
  const cleanHref = stripTrackingParams(href);
  // A fragment points inside this same document - a heading link, or a
  // citation whose source went missing. Opening it in a new tab lands the
  // reader on a blank page instead of the thing they asked to see.
  const samePage = cleanHref.startsWith(FRAGMENT_PREFIX);
  return (
    <a
      href={cleanHref}
      className="text-primary hover:underline"
      {...(samePage ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {children}
    </a>
  );
};

const MarkdownParagraph = ({ children }: { children?: React.ReactNode }) => {
  const citations = useMarkdownCitations();
  return <p className="mb-3 leading-relaxed">{unwrapCitationParens(children, citations)}</p>;
};

const MarkdownListItem = ({ children }: { children?: React.ReactNode }) => {
  const citations = useMarkdownCitations();
  return <li className="mb-1">{unwrapCitationParens(children, citations)}</li>;
};

const MarkdownTableCell = ({ children }: { children?: React.ReactNode }) => {
  const citations = useMarkdownCitations();
  return (
    <td className="border border-border px-3 py-2">{unwrapCitationParens(children, citations)}</td>
  );
};

const markdownComponents: Components = {
  code: CodeBlock as Components['code'],
  img: MarkdownImage as Components['img'],
  h1: ({ children }) => <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>,
  p: MarkdownParagraph as Components['p'],
  ul: ({ children }) => <ul className="mb-3 list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal pl-6">{children}</ol>,
  li: MarkdownListItem as Components['li'],
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-border pl-4 text-muted-foreground [&>:last-child]:mb-0">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: MarkdownTableCell as Components['td'],
  a: MarkdownLink as Components['a'],
};

const EMPTY_CITATIONS: readonly MarkdownCitation[] = [];

const REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
  rehypeKatex,
] satisfies React.ComponentProps<typeof ReactMarkdown>['rehypePlugins'];

export interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  skipPreprocess?: boolean;
  citations?: readonly MarkdownCitation[];
}

function MarkdownContentImpl({
  content,
  isStreaming,
  skipPreprocess,
  citations,
}: MarkdownContentProps) {
  const processedContent = useMemo(() => {
    const base = skipPreprocess ? content : preprocessMath(content);
    return citations && citations.length > 0
      ? linkifyCitationMarkers(base, citations.length)
      : base;
  }, [content, skipPreprocess, citations]);
  return (
    <StreamTailContext.Provider value={Boolean(isStreaming)}>
      <CitationsContext.Provider value={citations ?? EMPTY_CITATIONS}>
        <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={markdownComponents}
          >
            {processedContent}
          </ReactMarkdown>
        </Tooltip.Provider>
      </CitationsContext.Provider>
      {isStreaming && content.trim() && (
        <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-primary" />
      )}
    </StreamTailContext.Provider>
  );
}

export const MarkdownContent = React.memo(MarkdownContentImpl);
MarkdownContent.displayName = 'MarkdownContent';
