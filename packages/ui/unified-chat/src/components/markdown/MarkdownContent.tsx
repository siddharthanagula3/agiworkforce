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
import type { Components } from 'react-markdown';
import { Button } from '@agiworkforce/ui';
import { Copy, Check, ImageOff } from 'lucide-react';
// KaTeX CSS must be loaded alongside rehype-katex so rendered math is styled.
import 'katex/dist/katex.min.css';
// AUDIT-FIX ART-9: rehype-highlight only emits `hljs-*` class names; no theme
// stylesheet was ever imported and no `.hljs*` rule exists in the app CSS, so
// syntax highlighting produced no colour at all. github-dark is chosen to pair
// with the pinned dark `.code-block-body` background (ART-8, apps/web globals.css).
import 'highlight.js/styles/github-dark.css';

const CodeBlock = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          aria-label={copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
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

/**
 * Inline markdown image (`![alt](src)`) renderer — the raster-image path for
 * tool-returned and model-referenced images embedded in assistant markdown.
 *
 * claude.ai parity:
 *  - a real `<img>` preview (not a link/icon), capped to a readable size and
 *    responsive (never overflows a 375px column),
 *  - a loading shimmer until the bytes decode,
 *  - a graceful broken-image fallback (never a browser "broken image" glyph or
 *    a fabricated placeholder) when the source fails to load,
 *  - click-to-expand: opens the full-resolution image in a new tab. Rich
 *    zoom/pan is provided by `ImageLightbox` on the attachment path; markdown
 *    images intentionally reuse the browser's native full view here rather than
 *    pulling an app-layer lightbox into this shared package.
 *
 * `data:`/`blob:` sources survive sanitization (see markdownSanitizeSchema.ts);
 * any other scheme is left to the sanitizer's http(s) allow-list, so no
 * arbitrary/off-origin fetch is introduced here.
 *
 * AUDIT-FIX BUG-26: the click-to-expand anchor is gated on the source scheme.
 * `markdownSanitizeSchema.ts` deliberately widens `protocols.src` to `data:`
 * and `blob:` while keeping `href` on the strict default list, with a comment
 * stating that links must not smuggle `data:` payloads. Wrapping every image in
 * `<a href={src}>` routed exactly those widened sources back into an href and
 * broke that invariant — a `blob:` URL holding HTML navigates same-origin and
 * executes in the app's origin. Non-navigable sources now render the image with
 * no link rather than a link the sanitizer would never have allowed.
 */

/**
 * True when `src` is safe to put in an `href`: an http(s) URL, or a
 * scheme-less relative/protocol-relative reference (e.g. `/api/files/123`).
 * Anything carrying its own scheme — `data:`, `blob:`, `javascript:`,
 * `filesystem:` — is rejected.
 */
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

  // AUDIT-FIX BUG-26: no anchor for `data:`/`blob:` (or any other non-http)
  // source. The image still renders at full size inline; what is dropped is an
  // affordance that would have violated the sanitizer's href invariant, not
  // any content.
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
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

// Hoisted so the three arrays are built once rather than on every render of
// every visible message. react-markdown rebuilds its unified processor per
// render either way (`createProcessor` is not memoized upstream), so stability
// here buys the allocations back, not the parse — the memo boundary below is
// what keeps the parse itself off the streaming path.
const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkBreaks] satisfies React.ComponentProps<
  typeof ReactMarkdown
>['remarkPlugins'];

// Order: raw HTML parsed -> sanitized -> math rendered as KaTeX spans
// (rehype-katex must run before rehype-highlight so highlight never sees
// language-math code blocks, which would otherwise produce block-level div/pre
// nodes and trigger a p > div hydration error when math appears inline) ->
// syntax highlighted. rehypeRaw without a sanitizer is an XSS hazard on this
// live path.
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
  // Convert \[...\] and \(...\) to $$...$$/$...$ before remark-math runs,
  // since remark-math only recognises dollar-sign delimiters by default.
  // Keyed on `content` alone so a bare isStreaming flip (caret on/off at the
  // end of a turn) does not rescan the whole answer.
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

/**
 * Both props are primitives, so React's default shallow comparison is exactly
 * the right identity: re-parse only when the text or the caret state changes.
 */
export const MarkdownContent = React.memo(MarkdownContentImpl);
MarkdownContent.displayName = 'MarkdownContent';
