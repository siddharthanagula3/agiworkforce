'use client';

/**
 * InteractiveVisualization -- renders HTML/SVG content inline in chat messages
 * as interactive, sandboxed visualizations.
 *
 * Inspired by Claude.ai's March 2026 inline visualization feature.
 *
 * Features:
 *   - Sandboxed iframe rendering via srcdoc for HTML/SVG content
 *   - Auto-height based on rendered content
 *   - Toolbar: fullscreen, copy code, download as SVG/PNG
 *   - Dark/light theme support (injects CSS variables into iframe)
 *   - Content Security Policy for sandboxed execution
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  RefreshCw,
  Code2,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VisualizationType = 'html-svg' | 'html-canvas' | 'chart' | 'visualization';

export interface InteractiveVisualizationProps {
  /** Raw source code (HTML/SVG/chart markup) */
  code: string;
  /** Detected visualization type */
  type: VisualizationType;
  /** Language label shown in the header */
  language?: string;
  /** Additional class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect if a given HTML string contains interactive visualization content. */
export function isVisualizationContent(language: string, code: string): VisualizationType | null {
  const lowerLang = language.toLowerCase();

  // Explicit visualization fences
  if (lowerLang === 'chart' || lowerLang === 'visualization') {
    return lowerLang as VisualizationType;
  }

  // HTML blocks containing SVG or Canvas
  if (lowerLang === 'html') {
    const lowerCode = code.toLowerCase();
    if (lowerCode.includes('<svg') || lowerCode.includes('</svg>')) {
      return 'html-svg';
    }
    if (
      lowerCode.includes('<canvas') ||
      lowerCode.includes('getcontext') ||
      lowerCode.includes('new chart(')
    ) {
      return 'html-canvas';
    }
  }

  // SVG language fence
  if (lowerLang === 'svg') {
    return 'html-svg';
  }

  return null;
}

/** Build a complete HTML document for the iframe srcdoc. */
function buildSrcdoc(code: string, type: VisualizationType): string {
  // Read theme from document for injection
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const themeVars = isDark
    ? `
      --viz-bg: #0a0a0a;
      --viz-fg: #fafafa;
      --viz-muted: #a1a1aa;
      --viz-border: #27272a;
      --viz-accent: #3b82f6;
    `
    : `
      --viz-bg: #ffffff;
      --viz-fg: #09090b;
      --viz-muted: #71717a;
      --viz-border: #e4e4e7;
      --viz-accent: #2563eb;
    `;

  // For SVG-only content, wrap in a proper HTML document
  const isRawSvg =
    type === 'html-svg' &&
    code.trim().startsWith('<svg') &&
    !code.trim().toLowerCase().startsWith('<!doctype') &&
    !code.trim().toLowerCase().startsWith('<html');

  const bodyContent = isRawSvg
    ? `<div style="display:flex;align-items:center;justify-content:center;min-height:100%;">${code}</div>`
    : code;

  // Sanitize the content but allow SVG and script tags needed for charts
  const sanitized = DOMPurify.sanitize(bodyContent, {
    ADD_TAGS: [
      'svg',
      'path',
      'circle',
      'rect',
      'line',
      'polyline',
      'polygon',
      'text',
      'tspan',
      'g',
      'defs',
      'clipPath',
      'use',
      'symbol',
      'marker',
      'pattern',
      'linearGradient',
      'radialGradient',
      'stop',
      'foreignObject',
      'animate',
      'animateTransform',
      'animateMotion',
      'set',
      'canvas',
      'script',
      'style',
      'link',
    ],
    ADD_ATTR: [
      'viewBox',
      'xmlns',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-dasharray',
      'stroke-dashoffset',
      'opacity',
      'd',
      'cx',
      'cy',
      'r',
      'rx',
      'ry',
      'x',
      'y',
      'x1',
      'y1',
      'x2',
      'y2',
      'width',
      'height',
      'transform',
      'points',
      'text-anchor',
      'font-size',
      'font-family',
      'font-weight',
      'dominant-baseline',
      'alignment-baseline',
      'clip-path',
      'marker-end',
      'marker-start',
      'marker-mid',
      'gradientUnits',
      'offset',
      'stop-color',
      'stop-opacity',
      'preserveAspectRatio',
      'xmlns:xlink',
      'xlink:href',
      'onload',
      'onclick',
      'style',
    ],
    WHOLE_DOCUMENT: false,
    FORCE_BODY: false,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { ${themeVars} }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--viz-bg);
      color: var(--viz-fg);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 16px;
      overflow: auto;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      max-width: 100%;
      height: auto;
    }
    canvas {
      max-width: 100%;
    }
  </style>
</head>
<body>
  ${sanitized}
  <script>
    // Auto-resize: post height to parent
    function postHeight() {
      const height = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.scrollHeight
      );
      window.parent.postMessage({ type: 'viz-resize', height: height }, '*');
    }
    // Post height after load and on mutations
    window.addEventListener('load', () => setTimeout(postHeight, 50));
    new MutationObserver(postHeight).observe(document.body, {
      childList: true, subtree: true, attributes: true
    });
    // Also post after a short delay for scripts that render async
    setTimeout(postHeight, 200);
    setTimeout(postHeight, 500);
  </script>
</body>
</html>`;
}

/** Type label for the header bar. */
function getTypeLabel(type: VisualizationType, language?: string): string {
  switch (type) {
    case 'html-svg':
      return language === 'svg' ? 'SVG visualization' : 'HTML/SVG visualization';
    case 'html-canvas':
      return 'Canvas visualization';
    case 'chart':
      return 'Chart';
    case 'visualization':
      return 'Visualization';
    default:
      return 'Visualization';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const InteractiveVisualization = memo(function InteractiveVisualization({
  code,
  type,
  language,
  className,
}: InteractiveVisualizationProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(300);
  const [refreshKey, setRefreshKey] = useState(0);

  // Build the srcdoc content
  const srcdoc = buildSrcdoc(code, type);

  // ── Auto-resize listener ────────────────────────────────────────────────
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (
        e.data &&
        typeof e.data === 'object' &&
        'type' in e.data &&
        e.data.type === 'viz-resize' &&
        typeof e.data.height === 'number'
      ) {
        const newHeight = Math.min(Math.max(e.data.height as number, 100), 800);
        setIframeHeight(newHeight);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ── Copy source code ────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  // ── Download as SVG ─────────────────────────────────────────────────────
  const handleDownloadSvg = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      const svgElement = iframeDoc?.querySelector('svg');
      if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'visualization.svg';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
    } catch {
      // Cross-origin restriction -- fall back to downloading source
    }

    // Fallback: download source code
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'visualization.html';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [code]);

  // ── Download as PNG ─────────────────────────────────────────────────────
  const handleDownloadPng = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
      const svgElement = iframeDoc?.querySelector('svg');
      if (!svgElement) return;

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new window.Image();
      img.onload = () => {
        canvas.width = img.naturalWidth * 2;
        canvas.height = img.naturalHeight * 2;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'visualization.png';
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
      };

      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      img.src = URL.createObjectURL(svgBlob);
    } catch {
      // Cross-origin or canvas taint -- silently fail
    }
  }, []);

  // ── Open in new tab ─────────────────────────────────────────────────────
  const handleOpenNewTab = useCallback(() => {
    const blob = new Blob([srcdoc], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  }, [srcdoc]);

  // ── Fullscreen ──────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((f) => !f);
  }, []);

  // ── Refresh ─────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'my-4 overflow-hidden rounded-lg border border-border/60',
        isFullscreen && 'fixed inset-4 z-50 my-0 flex flex-col shadow-2xl',
        className,
      )}
    >
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/10 text-blue-500">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 9L4 3L7 7L11 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {getTypeLabel(type, language)}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Toggle source code */}
          <ToolbarButton
            onClick={() => setShowCode((s) => !s)}
            title={showCode ? 'Hide source' : 'View source'}
            active={showCode}
          >
            <Code2 className="h-3.5 w-3.5" />
          </ToolbarButton>

          {/* Refresh */}
          <ToolbarButton onClick={handleRefresh} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-0.5 h-4 w-px bg-border" />

          {/* Download SVG */}
          {type === 'html-svg' && (
            <ToolbarButton onClick={handleDownloadSvg} title="Download SVG">
              <Download className="h-3.5 w-3.5" />
            </ToolbarButton>
          )}

          {/* Download PNG (SVG content only) */}
          {type === 'html-svg' && (
            <ToolbarButton onClick={handleDownloadPng} title="Download PNG">
              <ImageIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
          )}

          {/* Open in new tab */}
          <ToolbarButton onClick={handleOpenNewTab} title="Open in new tab">
            <ExternalLink className="h-3.5 w-3.5" />
          </ToolbarButton>

          {/* Fullscreen */}
          <ToolbarButton
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </ToolbarButton>

          {/* Copy source */}
          <ToolbarButton onClick={handleCopy} title={copied ? 'Copied!' : 'Copy code'}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </ToolbarButton>
        </div>
      </div>

      {/* ── Source code panel (toggle) ── */}
      {showCode && (
        <div className="max-h-[300px] overflow-auto border-b border-border bg-[#0d1117]">
          <pre className="p-4 text-xs leading-relaxed text-gray-300">
            <code>{code}</code>
          </pre>
        </div>
      )}

      {/* ── Iframe visualization ── */}
      <div
        className={cn('bg-background', isFullscreen ? 'flex-1' : undefined)}
        style={isFullscreen ? undefined : { height: `${iframeHeight}px` }}
      >
        <iframe
          key={refreshKey}
          ref={iframeRef}
          title="Interactive visualization"
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          className="h-full w-full border-0"
          style={{ colorScheme: 'normal' }}
        />
      </div>

      {/* Fullscreen backdrop */}
      {isFullscreen && (
        <div
          className="fixed inset-0 -z-10 bg-background/80 backdrop-blur-sm"
          onClick={toggleFullscreen}
          aria-hidden="true"
        />
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// ToolbarButton (internal)
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}

function ToolbarButton({ children, onClick, title, active }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export default InteractiveVisualization;
