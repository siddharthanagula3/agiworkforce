/**
 * MCPAppDefinitionRenderer
 *
 * Renders interactive MCP App UIs (charts, dashboards, forms) from structured
 * McpAppDefinition objects inside a sandboxed iframe embedded in the chat
 * stream or tool result card.
 *
 * This complements the lower-level McpAppRenderer (html/url payloads) by
 * operating on higher-level component definitions: a tool declares which
 * built-in components to render (chart, table, form, markdown, code) and
 * provides a data payload; this renderer generates the srcdoc HTML and
 * handles the two-way postMessage bridge.
 *
 * Security properties:
 *   - iframe sandbox="allow-scripts" only — NO allow-same-origin, no
 *     allow-top-navigation, no allow-forms (form submissions stay in the
 *     iframe JS and are forwarded via postMessage, not HTTP)
 *   - postMessage source validated against iframeRef.current.contentWindow
 *   - Origin validated: sandboxed iframes have opaque 'null' origin; any
 *     non-null, non-host origin is rejected
 *   - All user data is JSON-encoded via generateSrcdoc() — never injected
 *     into the srcdoc via innerHTML on the host side
 *   - No eval(), no dynamic code execution on the host
 */

import { useRef, useState, useEffect, useMemo, useCallback, memo } from 'react';
import { LayoutGrid, AlertTriangle, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { generateSrcdoc } from './MCPAppComponents';
import type { McpAppDefinition } from './MCPAppRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPAppRendererProps {
  /** Full app definition — component slots, name, server, description */
  appDefinition: McpAppDefinition;
  /**
   * Latest tool result to bind into the component slots.
   * On initial mount this is baked into the srcdoc. Subsequent changes are
   * pushed via a "mcp:data" postMessage without regenerating the srcdoc.
   */
  toolResult?: unknown;
  /**
   * Called when the user performs an action inside the app
   * (form submission, custom button click, etc.).
   * Receives the JSON-RPC method name and params from the iframe.
   */
  onAction?: (method: string, params: unknown) => void;
  /** Hard cap on iframe height in pixels. Defaults to 400. */
  maxHeight?: number;
  /** Extra Tailwind classes for the outer wrapper */
  className?: string;
}

/** JSON-RPC message shape used by the iframe ↔ host bridge */
interface IframeMessage {
  jsonrpc?: '2.0';
  method: string;
  params: unknown;
}

// ---------------------------------------------------------------------------
// Theme helper
// ---------------------------------------------------------------------------

/**
 * Resolve the current app theme to 'dark' | 'light' by inspecting the
 * <html> element class list and the prefers-color-scheme media query.
 * This matches the logic in the settingsStore applyTheme() function.
 */
function resolveTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MIN_HEIGHT = 80;
const MAX_HEIGHT_DEFAULT = 400;

function MCPAppDefinitionRendererInner({
  appDefinition,
  toolResult,
  onAction,
  maxHeight = MAX_HEIGHT_DEFAULT,
  className,
}: MCPAppRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Height is driven by the iframe reporting its own scrollHeight via postMessage
  const [iframeHeight, setIframeHeight] = useState<number>(
    Math.max(appDefinition.minHeight ?? 120, MIN_HEIGHT),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // ── srcdoc ──────────────────────────────────────────────────────────────
  // Regenerated only when the app definition changes (not on toolResult change;
  // data updates are pushed via postMessage to avoid a full iframe reload).
  const srcdoc = useMemo(
    () => generateSrcdoc(appDefinition, toolResult),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appDefinition],
  );

  // ── host → iframe: postMessage helper ───────────────────────────────────

  const postToIframe = useCallback((method: string, params: unknown) => {
    const iw = iframeRef.current?.contentWindow;
    if (!iw) return;
    // Sandboxed iframes (no allow-same-origin) have an opaque origin.
    // The postMessage targetOrigin must be '*'; we compensate with
    // source-identity validation on the receiving side.
    iw.postMessage({ method, params }, '*');
  }, []);

  // ── push toolResult changes without reloading srcdoc ────────────────────

  const prevToolResultRef = useRef<unknown>(toolResult);
  useEffect(() => {
    if (prevToolResultRef.current === toolResult) return;
    prevToolResultRef.current = toolResult;
    if (!isLoading) {
      postToIframe('mcp:data', { toolResult });
    }
  }, [toolResult, isLoading, postToIframe]);

  // ── sync theme to iframe ─────────────────────────────────────────────────

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const mutationObs = new MutationObserver(() => {
      postToIframe('mcp:theme', { theme: resolveTheme() });
    });
    mutationObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const mqHandler = () => postToIframe('mcp:theme', { theme: resolveTheme() });
    mq.addEventListener('change', mqHandler);

    return () => {
      mutationObs.disconnect();
      mq.removeEventListener('change', mqHandler);
    };
  }, [postToIframe]);

  // ── iframe → host: postMessage listener ─────────────────────────────────

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;

      // Source identity check: only accept from our specific iframe element
      if (event.source !== iframe.contentWindow) return;

      // Origin check:
      //   - Sandboxed iframes without allow-same-origin produce 'null' origin
      //   - Reject any other cross-origin source
      if (event.origin !== 'null' && event.origin !== window.location.origin) return;

      const raw: unknown = event.data;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const msg = raw as IframeMessage;
      if (!msg.method || typeof msg.method !== 'string') return;

      switch (msg.method) {
        case 'mcp:ready':
          // Iframe bootstrapped — send the full init payload with current theme
          postToIframe('mcp:init', {
            appDefinition,
            toolResult,
            theme: resolveTheme(),
          });
          break;

        case 'mcp:resize': {
          const resizeParams = msg.params as { height?: number } | null;
          if (typeof resizeParams?.height === 'number' && resizeParams.height > 0) {
            const hardMax = expanded
              ? Math.floor(window.innerHeight * 0.85)
              : maxHeight;
            setIframeHeight(
              Math.min(Math.max(resizeParams.height, MIN_HEIGHT), hardMax),
            );
          }
          // Treat first resize report as "loaded"
          setIsLoading(false);
          break;
        }

        case 'mcp:action':
        case 'mcp:event':
          onAction?.(msg.method, msg.params);
          break;

        default:
          // Unknown method — silently ignore
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [appDefinition, toolResult, onAction, postToIframe, expanded, maxHeight]);

  // ── iframe error handler ─────────────────────────────────────────────────

  const handleIframeError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  // ── computed display height ─────────────────────────────────────────────

  const hardMax = expanded
    ? Math.floor(window.innerHeight * 0.85)
    : maxHeight;
  const displayHeight = Math.min(iframeHeight, hardMax);

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'rounded-lg border border-border overflow-hidden bg-background',
        className,
      )}
    >
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-xs font-medium text-muted-foreground truncate">
            {appDefinition.name}
          </span>
          {appDefinition.description && (
            <span className="text-xs text-muted-foreground/60 truncate hidden sm:inline">
              — {appDefinition.description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-xs py-0 px-1.5 h-4">
            MCP App
          </Badge>
          {appDefinition.server && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4">
              {appDefinition.server}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="xs"
            aria-label={expanded ? 'Collapse app' : 'Expand app'}
            onClick={() => setExpanded((prev) => !prev)}
            className="h-5 w-5 p-0"
          >
            {expanded ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="relative" style={{ minHeight: MIN_HEIGHT }}>

        {/* Loading overlay */}
        {isLoading && !hasError && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-background/70 z-10"
            aria-label="Loading MCP app"
          >
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-2 py-8 px-4 text-center',
              'bg-destructive/5',
            )}
            role="alert"
          >
            <AlertTriangle className="w-5 h-5 text-destructive/60" />
            <p className="text-xs text-muted-foreground">
              Failed to render MCP App — the iframe could not be loaded.
            </p>
          </div>
        )}

        {/* Sandboxed iframe */}
        {!hasError && (
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            /**
             * Sandbox flags — deliberately minimal:
             *   allow-scripts  : required for the component rendering JS
             *   NO allow-same-origin : iframe runs in an opaque origin
             *   NO allow-top-navigation : cannot hijack the host page URL
             *   NO allow-forms : HTTP form submissions are blocked; the iframe
             *     JS intercepts submit events and forwards them via postMessage
             *   NO allow-popups, allow-downloads, allow-modals
             */
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            title={`MCP App: ${appDefinition.name}`}
            aria-label={`Interactive MCP app from ${appDefinition.server}: ${appDefinition.name}`}
            onError={handleIframeError}
            style={{
              display: 'block',
              width: '100%',
              height: displayHeight,
              border: 'none',
              transition: 'height 150ms ease',
            }}
          />
        )}
      </div>
    </div>
  );
}

MCPAppDefinitionRendererInner.displayName = 'MCPAppDefinitionRenderer';

/**
 * MCPAppRenderer — memoized export.
 *
 * Named export alias matches the interface name requested in the task spec.
 * The file is named MCPAppDefinitionRenderer.tsx to avoid filesystem collision
 * with the existing McpAppRenderer.tsx (html/url payload renderer).
 */
export const MCPAppRenderer = memo(MCPAppDefinitionRendererInner);

export default MCPAppRenderer;
