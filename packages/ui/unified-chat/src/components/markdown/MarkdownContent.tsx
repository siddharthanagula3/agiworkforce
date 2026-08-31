import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '../../lib/utils';
import { MARKDOWN_SANITIZE_SCHEMA } from './markdownSanitizeSchema';
import { preprocessMath } from './preprocessMath';
import { reactNodeText } from './reactNodeText';
import { MermaidDiagram } from './MermaidDiagram';
import type { Components } from 'react-markdown';
import { Button } from '@agiworkforce/ui';
import { Copy, Check, ImageOff } from 'lucide-react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

const CodeBlock = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
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
    return <MermaidDiagram source={codeString} className="mermaid-block my-4" />;
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
          className="h-7 gap-1.5 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
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
          <code className={className}>{children}</code>
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

  if (!navigable) {
    return (
      <span className="relative my-2 inline-block max-w-full align-top" title={title || alt}>
        {picture}
      </span>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="relative my-2 inline-block max-w-full align-top no-underline"
      title={title || alt || 'Open image in a new tab'}
      aria-label={alt ? `Open image in a new tab: ${alt}` : 'Open image in a new tab'}
    >
      {picture}
    </a>
  );
};

const markdownComponents: Components = {
  code: CodeBlock as Components['code'],
  img: MarkdownImage as Components['img'],
  h1: ({ children }) => <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal pl-6">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
  a: ({ href, children }) => {
    // A fragment points inside this same document - a citation marker reaching
    // its source, a heading link. Opening it in a new tab lands the reader on a
    // blank page instead of the thing they asked to see.
    const samePage = typeof href === 'string' && href.startsWith('#');
    return (
      <a
        href={href}
        className="text-primary hover:underline"
        {...(samePage ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
      >
        {children}
      </a>
    );
  },
};

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkBreaks] satisfies React.ComponentProps<
  typeof ReactMarkdown
>['remarkPlugins'];

const REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
  rehypeKatex,
  rehypeHighlight,
] satisfies React.ComponentProps<typeof ReactMarkdown>['rehypePlugins'];

export interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * Canonical chat markdown renderer, shared by web and desktop.
 *
 * Source of truth ported from apps/web/features/chat/components/messages/
 * MarkdownContent.tsx (round-consolidated into unified-chat). Plugin order
 * (raw HTML -> sanitize -> KaTeX -> syntax highlight) and the KaTeX CSS
 * import are both load-bearing — see inline comments below and
 * markdownSanitizeSchema.ts.
 *
 * Exported memoized (see below). Scoped to what the two live call paths
 * actually do, because the saving is not uniform across them:
 *
 * - Desktop (App.tsx -> DesktopShellV3 -> ChatInterface -> MessageList ->
 *   MessageBubble -> ThinkingBlock:274). Nothing on that chain has a memo
 *   boundary, so every token of the *answer* re-rendered the reasoning body
 *   above it and re-parsed the whole already-finished reasoning text. This
 *   memo bails there — that is the large win.
 * - Web (/chat -> WebChatPage -> ChatMessageList -> apps/web MessageBubble
 *   :1166). That bubble is already memoized on content, so finished messages
 *   did not re-render before this either; what this memo saves there is the
 *   mid-turn renders where metadata changes while content does not.
 *
 * It does NOT make the message that is actively streaming cheaper: its content
 * genuinely changes on every token, so it re-parses either way.
 */
function MarkdownContentImpl({ content, isStreaming }: MarkdownContentProps) {
  const processedContent = useMemo(() => preprocessMath(content), [content]);
  return (
    <>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={markdownComponents}
      >
        {processedContent}
      </ReactMarkdown>
      {isStreaming && content.trim() && (
        <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-primary" />
      )}
    </>
  );
}

export const MarkdownContent = React.memo(MarkdownContentImpl);
MarkdownContent.displayName = 'MarkdownContent';
