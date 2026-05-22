/**
 * McpAppRenderer
 *
 * Renders MCP app content inside a sandboxed iframe. Security properties:
 * - sandbox="allow-scripts allow-forms allow-popups" — NO allow-same-origin
 * - referrerPolicy="no-referrer"
 * - srcDoc used for HTML payloads (safest — no network request)
 * - postMessage bridge for two-way communication (origin-validated)
 * - Never eval() user-provided content
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Shield } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { McpApp } from '../../stores/mcpAppStore';
import { useMcpAppStore } from '../../stores/mcpAppStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpAppRendererProps {
  app: McpApp;
  className?: string;
  onAction?: (action: string, data: unknown) => void;
}

/** Messages sent FROM the iframe TO us */
interface IframeOutboundMessage {
  type: 'mcp_action' | 'resize';
  action?: string;
  data?: unknown;
  height?: number;
}

/** Messages sent FROM us TO the iframe */
interface IframeInboundMessage {
  type: 'mcp_update';
  data: unknown;
}

// ─── URL Safety ──────────────────────────────────────────────────────────────

const safeMcpHref = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '#';
    return url;
  } catch {
    return '#';
  }
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 800;

/**
 * Sandbox attribute — NEVER add "allow-same-origin":
 * that would allow the iframe to escape the sandbox and access parent DOM.
 */
const IFRAME_SANDBOX = 'allow-scripts allow-forms allow-popups';

// ─── Component ───────────────────────────────────────────────────────────────

const McpAppRendererComponent: React.FC<McpAppRendererProps> = ({ app, className, onAction }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [height, setHeight] = useState(app.content.height ?? DEFAULT_HEIGHT);

  const recordInteraction = useMcpAppStore((state) => state.recordInteraction);

  // ─── postMessage listener ─────────────────────────────────────────────────

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Origin validation: for srcDoc iframes, origin is "null" (opaque origin)
      // For URL iframes, we validate against allowedOrigins when provided.
      const allowedOrigins = app.content.allowedOrigins ?? [];
      const isNullOrigin = event.origin === 'null' || event.origin === '';

      if (app.content.type === 'url') {
        // For URL iframes: only accept messages if origin matches allowed list
        // (or no restriction was specified)
        if (allowedOrigins.length > 0 && !allowedOrigins.includes(event.origin)) {
          return;
        }
      } else {
        // For HTML (srcDoc) iframes: only accept null-origin messages from our iframe
        if (!isNullOrigin) return;
      }

      // Ensure the message comes from our specific iframe (when possible)
      if (
        iframeRef.current &&
        event.source !== null &&
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }

      // Safely parse the message
      const raw: unknown = event.data;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const msg = raw as IframeOutboundMessage;

      if (msg.type === 'resize' && typeof msg.height === 'number') {
        const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, msg.height));
        setHeight(clamped);
        return;
      }

      if (msg.type === 'mcp_action' && typeof msg.action === 'string') {
        // Record in interaction log
        recordInteraction(app.id, {
          timestamp: Date.now(),
          type: 'user_action',
          data: { action: msg.action, payload: msg.data ?? null },
        });

        // Forward to parent component
        onAction?.(msg.action, msg.data ?? null);
      }
    },
    [app.id, app.content.type, app.content.allowedOrigins, recordInteraction, onAction],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // ─── Public API: send data update to iframe ───────────────────────────────

  const sendUpdate = useCallback((data: unknown) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const msg: IframeInboundMessage = { type: 'mcp_update', data };
    // Using '*' as the target origin is safe here because the iframe is sandboxed
    // WITHOUT "allow-same-origin" (see IFRAME_SANDBOX constant). Without that flag,
    // the iframe runs in an opaque origin and cannot navigate itself to a malicious
    // page that would intercept our messages. A specific origin cannot be used
    // because srcDoc iframes always have an opaque ("null") origin, and URL iframes
    // may serve from any host. The message payload contains only non-sensitive UI
    // update data — no credentials, tokens, or PII are transmitted.
    iframe.contentWindow.postMessage(msg, '*');
  }, []);

  // Expose sendUpdate via a ref accessible to parent (via onAction callback pattern)
  // This is intentionally not exposed as a prop to keep the interface simple.
  void sendUpdate; // referenced to avoid unused-variable lint warning

  // ─── Error / load handlers ────────────────────────────────────────────────

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoaded(true);
    setHasError(true);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const isHtml = app.content.type === 'html';
  const isUrl = app.content.type === 'url';

  return (
    <div className={cn('relative rounded-lg overflow-hidden border border-white/10', className)}>
      {/* Loading skeleton */}
      {!isLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10"
          aria-label="Loading MCP app"
        >
          <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-500/40 rounded text-red-400 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Failed to load app content.</span>
        </div>
      )}

      {/* Sandboxed iframe */}
      {!hasError && (
        <iframe
          ref={iframeRef}
          title={`MCP App: ${app.toolName}`}
          // HTML payloads use srcDoc (no network request, opaque origin, safest)
          {...(isHtml ? { srcDoc: app.content.payload } : { src: app.content.payload })}
          sandbox={IFRAME_SANDBOX}
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
          onError={handleError}
          className="w-full border-0 block bg-white dark:bg-zinc-950"
          style={{ height: `${height}px` }}
          aria-label={`Interactive MCP app from ${app.mcpServer}: ${app.toolName}`}
        />
      )}

      {/* "Open in browser" for URL type */}
      {isUrl && isLoaded && !hasError && (
        <div className="absolute bottom-2 right-2">
          <a
            href={safeMcpHref(app.content.payload)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-sm px-2 py-1 text-xs text-white hover:bg-black/90 transition-colors"
            aria-label="Open in external browser"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        </div>
      )}
    </div>
  );
};

McpAppRendererComponent.displayName = 'McpAppRenderer';

export const McpAppRenderer = memo(McpAppRendererComponent);

// ─── Security label badge ─────────────────────────────────────────────────────

export const McpAppSecurityBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
    <Shield className="h-2.5 w-2.5" />
    Sandboxed App
  </span>
);
