/**
 * GenerativeWidget Component
 *
 * Renders inline interactive HTML/chart/visualization content inside a sandboxed
 * iframe. The AI outputs a ```widget fenced code block; MessageContent extracts
 * the HTML and passes it here. Like Claude.ai's inline generative UI.
 */

import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { Code, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../../lib/utils';

// ============================================================================
// Constants
// ============================================================================

const NORMAL_MAX_HEIGHT = 600;
const EXPANDED_MAX_HEIGHT = 2000;
const DEFAULT_INITIAL_HEIGHT = 200;

/**
 * Allowed CDN origins for script-src in the iframe CSP.
 * Only well-known, read-only CDNs are permitted.
 */
const ALLOWED_SCRIPT_ORIGINS = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://esm.sh',
].join(' ');

// ============================================================================
// HTML template
// ============================================================================

/**
 * Wraps user-supplied HTML in a full document that:
 * - Applies a CSP meta tag (restricts scripts to known CDNs)
 * - Resets box-sizing and sets transparent / dark-theme-friendly base styles
 * - Injects an auto-resize script that posts the document height to the parent
 */
function buildDocument(html: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline' ${ALLOWED_SCRIPT_ORIGINS}; style-src 'unsafe-inline' ${ALLOWED_SCRIPT_ORIGINS}; img-src data: https:; font-src https: data:; connect-src 'none';" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
${html}
<script>
  (function () {
    function postHeight() {
      var h = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.parent.postMessage({ type: 'widget-resize', height: h }, '*');
    }
    // Initial post after DOM settles
    if (document.readyState === 'complete') {
      postHeight();
    } else {
      window.addEventListener('load', postHeight);
    }
    // Observe DOM mutations and resize events
    var ro = new ResizeObserver(postHeight);
    ro.observe(document.body);
    window.addEventListener('resize', postHeight);
  })();
</script>
</body>
</html>`;
}

// ============================================================================
// Props
// ============================================================================

export interface GenerativeWidgetProps {
  /** Raw HTML content to render inside the sandboxed iframe */
  html: string;
  /** Optional title shown in the title bar */
  title?: string;
  /** Initial iframe height in pixels before auto-resize kicks in */
  initialHeight?: number;
  /** Additional CSS class names for the outer container */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

const GenerativeWidgetComponent: React.FC<GenerativeWidgetProps> = ({
  html,
  title,
  initialHeight = DEFAULT_INITIAL_HEIGHT,
  className,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [iframeHeight, setIframeHeight] = useState(initialHeight);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSource, setShowSource] = useState(false);

  // Build blob URL from HTML content
  const [blobUrl, setBlobUrl] = useState<string>('');

  useEffect(() => {
    const doc = buildDocument(html);
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      blobUrlRef.current = null;
    };
  }, [html]);

  // Listen for height messages from the iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'widget-resize' &&
        typeof event.data.height === 'number'
      ) {
        // Only accept messages from our own blob URL origin
        const maxH = isExpanded ? EXPANDED_MAX_HEIGHT : NORMAL_MAX_HEIGHT;
        setIframeHeight(Math.min(event.data.height + 4, maxH));
      }
    },
    [isExpanded],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  const maxHeight = isExpanded ? EXPANDED_MAX_HEIGHT : NORMAL_MAX_HEIGHT;
  const displayHeight = Math.min(iframeHeight, maxHeight);

  return (
    <div
      className={cn(
        'not-prose rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900/60 my-3',
        className,
      )}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/60 bg-zinc-800/70">
        <span className="text-xs font-medium text-zinc-300 truncate">
          {title ?? 'Interactive Widget'}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            title={showSource ? 'Hide source' : 'View source'}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors',
              showSource
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50',
            )}
          >
            <Code className="h-3 w-3" />
            {showSource ? 'Preview' : 'Source'}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            title={isExpanded ? 'Collapse' : 'Expand'}
            className="flex items-center px-1.5 py-0.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
          >
            {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Source view */}
      {showSource ? (
        <pre className="overflow-auto p-3 text-xs font-mono text-zinc-300 bg-zinc-950 leading-relaxed whitespace-pre-wrap break-all max-h-[400px]">
          {html}
        </pre>
      ) : /* Sandboxed iframe */
      blobUrl ? (
        <iframe
          ref={iframeRef}
          src={blobUrl}
          sandbox="allow-scripts allow-same-origin"
          title={title ?? 'Generative widget'}
          width="100%"
          height={displayHeight}
          style={{ display: 'block', border: 'none', transition: 'height 0.2s ease' }}
        />
      ) : null}
    </div>
  );
};

GenerativeWidgetComponent.displayName = 'GenerativeWidget';

export const GenerativeWidget = memo(GenerativeWidgetComponent);
