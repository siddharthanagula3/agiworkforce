'use client';

/**
 * MermaidRenderer -- renders Mermaid diagram syntax into interactive SVG.
 *
 * Uses the mermaid library (already a project dependency) via dynamic import
 * to avoid SSR issues. Provides:
 *   - SVG output rendered from Mermaid DSL
 *   - Zoom/pan via CSS transform (scroll-wheel + drag)
 *   - Copy diagram source button
 *   - Download as SVG button
 *   - Dark/light theme support
 */

import React, { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Copy,
  Check,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MermaidRendererProps {
  /** Mermaid diagram source code */
  code: string;
  /** Additional class names */
  className?: string;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.15;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MermaidRenderer = memo(function MermaidRenderer({
  code,
  className,
}: MermaidRendererProps) {
  const containerId = useId();
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0 });

  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    x: 0,
    y: 0,
  });

  // Unique ID for mermaid render target (strip colons from useId output)
  const renderTargetId = `mermaid-${containerId.replace(/:/g, '')}`;

  // ── Render mermaid diagram ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;

        // Detect dark mode from document
        const isDark =
          typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        });

        const { svg } = await mermaid.render(renderTargetId, code.trim());

        if (!cancelled) {
          setSvgHtml(DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setSvgHtml(null);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [code, renderTargetId]);

  // ── Copy source ─────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
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
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'diagram.svg';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [svgHtml]);

  // ── Zoom controls ───────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setTransform((t) => ({
      ...t,
      scale: Math.min(MAX_SCALE, t.scale + ZOOM_STEP),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((t) => ({
      ...t,
      scale: Math.max(MIN_SCALE, t.scale - ZOOM_STEP),
    }));
  }, []);

  const resetView = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  // ── Mouse wheel zoom ───────────────────────────────────────────────────
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setTransform((t) => ({
        ...t,
        scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale + delta)),
      }));
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // ── Drag to pan ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      dragRef.current = {
        dragging: true,
        startX: e.clientX - transform.x,
        startY: e.clientY - transform.y,
      };
    },
    [transform.x, transform.y],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    setTransform((t) => ({
      ...t,
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  // ── Fullscreen toggle ──────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((f) => !f);
  }, []);

  // ── Error state ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        className={cn('my-4 overflow-hidden rounded-lg border border-destructive/30', className)}
      >
        <div className="flex items-center justify-between bg-destructive/10 px-4 py-2">
          <span className="text-xs font-medium text-destructive">mermaid -- render error</span>
          <ToolbarButton onClick={handleCopy} title="Copy source">
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </ToolbarButton>
        </div>
        <div className="bg-muted/30 p-4">
          <p className="mb-2 text-xs text-destructive">{error}</p>
          <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-400">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────
  if (!svgHtml) {
    return (
      <div className={cn('my-4 overflow-hidden rounded-lg border border-border/60', className)}>
        <div className="flex items-center bg-muted/50 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">mermaid -- rendering...</span>
        </div>
        <div className="flex h-48 items-center justify-center bg-background">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      </div>
    );
  }

  // ── Rendered diagram ────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'my-4 overflow-hidden rounded-lg border border-border/60',
        isFullscreen && 'fixed inset-4 z-50 my-0 shadow-2xl backdrop-blur-sm',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">mermaid -- diagram</span>
        <div className="flex items-center gap-0.5">
          {/* Zoom controls */}
          <ToolbarButton onClick={zoomOut} title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span className="min-w-[3ch] text-center text-[10px] tabular-nums text-muted-foreground">
            {Math.round(transform.scale * 100)}%
          </span>
          <ToolbarButton onClick={zoomIn} title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={resetView} title="Reset view">
            <RotateCcw className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          {/* Actions */}
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
          <ToolbarButton onClick={handleDownloadSvg} title="Download SVG">
            <Download className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={handleCopy} title={copied ? 'Copied!' : 'Copy source'}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </ToolbarButton>
        </div>
      </div>

      {/* Diagram canvas */}
      <div
        ref={svgContainerRef}
        className={cn(
          'overflow-hidden bg-background',
          isFullscreen ? 'h-[calc(100%-36px)]' : 'max-h-[500px] min-h-[200px]',
          dragRef.current.dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex h-full items-center justify-center p-4 transition-transform duration-75 [&>svg]:max-w-full"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'center center',
          }}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
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
}

function ToolbarButton({ children, onClick, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

export default MermaidRenderer;
