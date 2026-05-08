/**
 * ArtifactRenderer — surface-agnostic artifact content renderer.
 *
 * Ported from apps/desktop/src/components/UnifiedAgenticChat/ArtifactRenderer.tsx.
 *
 * Changes from source:
 * - Removed all @tauri-apps/* imports and isTauri guards
 * - Removed useCodeStore dependency; replaced with optional `onSaveArtifact` prop
 * - Removed @/lib/tauri-mock dependency
 * - Removed useThemeContext dep; accepts optional `isDark` prop (defaults to false)
 * - Removed PromptDialog / usePrompt (would need desktop UI); "Apply to file"
 *   action delegates to the optional `onApplyCode` prop
 * - Removed SectionErrorBoundary wrapper (host app provides error boundaries)
 * - Kept sanitizeHtml inline using DOMPurify-compatible allow-list logic via
 *   a local plaintext fallback (no heavy dependency on the desktop sanitize util).
 *   SVG/Mermaid rendering calls the local safe-sanitize helper.
 * - ReactPreview and sub-artifact components imported from this package.
 * - Charts / Tables remain inline (recharts is a peer dep in consumer apps; here
 *   we render them as plain text tables if recharts is not available).
 */

import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Network,
  Presentation,
  Table2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import type { Artifact } from '../lib/types';
import { PresentationArtifact } from './artifact-components/PresentationArtifact';
import { ReactPreview } from './artifact-components/ReactPreview';
import { SpreadsheetArtifact } from './artifact-components/SpreadsheetArtifact';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ArtifactRendererProps {
  artifact: Artifact;
  className?: string;
  /** Whether the host app is in dark mode. Affects code/mermaid themes. */
  isDark?: boolean;
  /**
   * Optional callback invoked when the user clicks "Apply to file" for code
   * artifacts. The host app (e.g. desktop with Tauri) implements the file-write.
   */
  onApplyCode?: (artifactId: string, content: string) => Promise<void>;
  /**
   * Optional callback invoked when the user requests a native PDF/Word/Excel
   * export. Desktop implements via Tauri invoke; web/mobile may no-op or redirect.
   */
  onExportNative?: (
    format: 'pdf' | 'word' | 'excel',
    artifactId: string,
    content: string,
    title: string,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Minimal SVG sanitizer (allow-list — no external dependency)
// ---------------------------------------------------------------------------

const SVG_ALLOWED_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'text',
  'tspan',
  'defs',
  'clipPath',
  'use',
  'image',
  'marker',
  'symbol',
  'title',
  'desc',
  'linearGradient',
  'radialGradient',
  'stop',
  'pattern',
  'mask',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComposite',
  'feGaussianBlur',
  'feMerge',
  'feMergeNode',
  'feOffset',
]);

const SVG_ALLOWED_ATTRS = new Set([
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'viewBox',
  'xmlns',
  'transform',
  'opacity',
  'class',
  'id',
  'preserveAspectRatio',
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-end',
  'marker-mid',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'orient',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'patternUnits',
  'patternTransform',
]);

/** Safely sanitize an SVG string by stripping disallowed tags/attributes. */
function sanitizeSvg(raw: string): string {
  // Parse using browser DOM parser, then walk and strip
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'image/svg+xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) return '';

    function sanitizeNode(node: Element) {
      const tagName = node.tagName.toLowerCase();
      if (!SVG_ALLOWED_TAGS.has(tagName)) {
        node.parentNode?.removeChild(node);
        return;
      }
      // Strip disallowed attributes
      const attrs = Array.from(node.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (!SVG_ALLOWED_ATTRS.has(name)) {
          node.removeAttribute(attr.name);
        }
        // Block javascript: URIs
        if (
          (name === 'href' || name === 'xlink:href') &&
          attr.value.trim().startsWith('javascript:')
        ) {
          node.removeAttribute(attr.name);
        }
      }
      // Recurse children (snapshot to avoid mutation during iteration)
      Array.from(node.children).forEach(sanitizeNode);
    }

    const svgEl = doc.documentElement;
    sanitizeNode(svgEl);
    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileExtension(artifact: Artifact): string {
  if (artifact.type === 'code' && artifact.language) return artifact.language;
  if (artifact.type === 'spreadsheet') return 'csv';
  if (artifact.type === 'presentation') return 'md';
  if (artifact.type === 'markdown') return 'md';
  if (artifact.type === 'svg') return 'svg';
  if (artifact.type === 'react') return 'tsx';
  return artifact.type === 'chart' || artifact.type === 'diagram' ? 'json' : 'txt';
}

function getArtifactIcon(type: string): React.ReactNode {
  switch (type) {
    case 'code':
      return <Code2 className="h-4 w-4" />;
    case 'chart':
      return <BarChart3 className="h-4 w-4" />;
    case 'diagram':
    case 'mermaid':
      return <Network className="h-4 w-4" />;
    case 'spreadsheet':
      return <FileSpreadsheet className="h-4 w-4" />;
    case 'presentation':
      return <Presentation className="h-4 w-4" />;
    case 'html':
      return <Globe className="h-4 w-4" />;
    case 'document':
    case 'markdown':
      return <FileText className="h-4 w-4" />;
    case 'svg':
      return <ImageIcon className="h-4 w-4" />;
    case 'react':
      return <Layers className="h-4 w-4" />;
    default:
      return <Code2 className="h-4 w-4" />;
  }
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function CodeArtifact({ artifact }: { artifact: Artifact }) {
  const lines = artifact.content.split('\n');
  return (
    <div className="overflow-x-auto bg-zinc-900 text-zinc-200" data-testid="code-artifact">
      <pre className="p-4 text-sm font-mono leading-relaxed whitespace-pre">{artifact.content}</pre>
      <div className="px-4 pb-2 text-[10px] text-zinc-500">{lines.length} lines</div>
    </div>
  );
}

function MarkdownArtifact({ artifact, isDark }: { artifact: Artifact; isDark: boolean }) {
  return (
    <div
      className={cn(
        'p-4 overflow-auto max-h-[600px]',
        isDark ? 'text-zinc-200 bg-zinc-900' : 'text-zinc-800 bg-white',
      )}
      data-testid="markdown-artifact"
    >
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {artifact.content}
      </pre>
    </div>
  );
}

function SvgArtifact({ artifact }: { artifact: Artifact }) {
  const sanitized = useMemo(() => sanitizeSvg(artifact.content), [artifact.content]);

  if (!sanitized) {
    return <div className="p-4 text-sm text-muted-foreground">Unable to render SVG content.</div>;
  }

  return (
    <div
      className="p-4 bg-white/5 rounded-lg overflow-auto flex justify-center items-center min-h-[200px]"
      data-testid="svg-artifact"
    >
      <div
        className="w-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    </div>
  );
}

function MermaidArtifact({ artifact, isDark }: { artifact: Artifact; isDark: boolean }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [svg, setSvg] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      if (!artifact.content) return;
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'Inter, sans-serif',
        });

        const id = `mermaid-${crypto.randomUUID().replace(/-/g, '')}`;
        if (!artifact.content.trim()) throw new Error('Empty diagram content');

        const { svg } = await mermaid.render(id, artifact.content);
        if (mounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    renderDiagram();
    return () => {
      mounted = false;
    };
  }, [artifact.content, isDark]);

  if (error) {
    return (
      <div className="p-4 border border-rose-500/20 bg-rose-500/10 rounded-lg">
        <p className="text-sm font-medium text-rose-400 mb-2">Failed to render diagram</p>
        <pre className="text-xs text-rose-300 whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  const sanitized = svg ? sanitizeSvg(svg) : null;

  return (
    <div
      className="p-4 bg-white/5 rounded-lg overflow-x-auto flex justify-center min-h-[200px] items-center"
      data-testid="mermaid-artifact"
    >
      {sanitized ? (
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: sanitized }}
          className="w-full h-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        />
      ) : (
        <div className="text-muted-foreground text-sm animate-pulse">Rendering diagram...</div>
      )}
    </div>
  );
}

function HtmlArtifact({ artifact }: { artifact: Artifact }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isRunning, setIsRunning] = useState(true);

  // Basic CSP-injected sandbox (same model as desktop version; comments preserved)
  const buildSandboxedHtml = useCallback((content: string): string => {
    const isFullDocument = /<html[\s>]/i.test(content) || /<!doctype/i.test(content);
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline' *; img-src * data: blob:; font-src * data:; connect-src 'none'; frame-src 'none'; object-src 'none';">`;
    const baseStyles = `<style>* { box-sizing: border-box; } body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; color: #e4e4e7; background: #18181b; }</style>`;

    if (isFullDocument) {
      let modifiedContent = content;
      if (!/<meta[^>]*content-security-policy/i.test(content)) {
        modifiedContent = modifiedContent.replace(/<head([^>]*)>/i, `<head$1>\n${cspMeta}`);
      }
      return modifiedContent;
    }

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${cspMeta}${baseStyles}</head><body>${content}</body></html>`;
  }, []);

  const srcDoc = useMemo(() => {
    if (!isRunning) return '';
    try {
      return buildSandboxedHtml(artifact.content);
    } catch {
      return '';
    }
  }, [artifact.content, buildSandboxedHtml, isRunning]);

  return (
    <div className="flex flex-col h-[400px]" data-testid="html-artifact">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-muted/50">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">HTML Preview</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setIsRunning((r) => !r)}
          className="text-xs px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          {isRunning ? 'Stop' : 'Run'}
        </button>
      </div>
      {isRunning && srcDoc && (
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          title={artifact.title || 'HTML Preview'}
          className="flex-1 border-0 w-full"
          sandbox="allow-scripts allow-modals"
          referrerPolicy="no-referrer"
        />
      )}
      {!isRunning && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setIsRunning(true)}
            className="px-3 py-1.5 text-xs bg-accent hover:bg-accent/80 rounded text-foreground"
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}

function TableArtifact({ artifact }: { artifact: Artifact }) {
  const tableData = useMemo(() => {
    try {
      const parsed = JSON.parse(artifact.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { columns: Object.keys(parsed[0]), rows: parsed };
      }
      return null;
    } catch {
      return null;
    }
  }, [artifact.content]);

  if (!tableData) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Invalid table data. Expected array of objects.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="table-artifact">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {tableData.columns.map((col) => (
              <th key={col} className="px-4 py-2 text-left font-semibold border-b">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row: Record<string, unknown>, i: number) => (
            <tr key={i} className="hover:bg-muted/50 border-b">
              {tableData.columns.map((col) => (
                <td key={col} className="px-4 py-2">
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ArtifactRenderer
// ---------------------------------------------------------------------------

export function ArtifactRenderer({
  artifact,
  className,
  isDark = false,
  onApplyCode,
  onExportNative,
}: ArtifactRendererProps) {
  const [copied, setCopied] = useState(false);
  const isMountedRef = useRef(true);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const artifactStatus = (artifact as Artifact & { status?: string }).status;
  const hasContent = typeof artifact.content === 'string' && artifact.content.trim().length > 0;
  const awaitingOutput = artifactStatus === 'running' && !hasContent;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!hasContent) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch {
      // clipboard write failed silently
    }
  };

  const handleDownload = () => {
    if (!hasContent) return;
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'artifact'}.${getFileExtension(artifact)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const supportsDocumentExport = [
    'code',
    'presentation',
    'mermaid',
    'markdown',
    'document',
  ].includes(artifact.type);
  const supportsExcelExport = ['spreadsheet', 'table'].includes(artifact.type);
  const supportsMarkdownExport = ['table', 'spreadsheet'].includes(artifact.type);

  const handleCopyMarkdown = async () => {
    try {
      const data = JSON.parse(artifact.content) as Record<string, string | number>[];
      if (!Array.isArray(data) || data.length === 0) return;
      const firstRow = data[0];
      if (!firstRow) return;
      const headers = Object.keys(firstRow);
      const headerRow = `| ${headers.join(' | ')} |`;
      const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
      const dataRows = data
        .map((row) => `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`)
        .join('\n');
      await navigator.clipboard.writeText(`${headerRow}\n${separatorRow}\n${dataRows}`);
    } catch {
      // clipboard write failed silently
    }
  };

  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  return (
    <div
      className={cn('rounded-lg border border-border overflow-hidden bg-card shadow-sm', className)}
      data-artifact-id={artifact.id}
      data-testid="artifact-renderer"
    >
      {/* Header */}
      <div className="flex flex-row items-center justify-between space-y-0 px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          {getArtifactIcon(artifact.type)}
          <span className="text-sm font-semibold">
            {artifact.title ||
              `${artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)} Artifact`}
          </span>
          {artifact.language && (
            <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground">
              {artifact.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Apply to file — delegate to host */}
          {artifact.type === 'code' && onApplyCode && (
            <button
              type="button"
              onClick={() => onApplyCode(artifact.id, artifact.content)}
              aria-label="Apply code to file"
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={awaitingOutput}
            aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={awaitingOutput}
              aria-label="Download or export artifact"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((o) => !o)}
              className="h-8 flex items-center justify-center gap-0.5 px-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
            </button>
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-md border border-border bg-card shadow-lg py-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleDownload();
                      setExportMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download as text
                  </button>

                  {(supportsDocumentExport || supportsExcelExport) && (
                    <div className="my-1 border-t border-border" />
                  )}

                  {supportsDocumentExport && onExportNative && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onExportNative(
                            'pdf',
                            artifact.id,
                            artifact.content,
                            artifact.title || 'document',
                          );
                          setExportMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                      >
                        <FileText className="h-4 w-4 text-red-500" />
                        Export as PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onExportNative(
                            'word',
                            artifact.id,
                            artifact.content,
                            artifact.title || 'document',
                          );
                          setExportMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                      >
                        <FileText className="h-4 w-4 text-blue-500" />
                        Export as Word
                      </button>
                    </>
                  )}

                  {supportsExcelExport && onExportNative && (
                    <button
                      type="button"
                      onClick={() => {
                        onExportNative(
                          'excel',
                          artifact.id,
                          artifact.content,
                          artifact.title || 'spreadsheet',
                        );
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-green-500" />
                      Export as Excel
                    </button>
                  )}

                  {supportsMarkdownExport && (
                    <>
                      <div className="my-1 border-t border-border" />
                      <button
                        type="button"
                        onClick={() => {
                          handleCopyMarkdown();
                          setExportMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                      >
                        <Table2 className="h-4 w-4 text-cyan-500" />
                        Copy as Markdown
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-hidden">
        {awaitingOutput ? (
          <div className="p-4 text-sm text-muted-foreground">Waiting for tool output...</div>
        ) : artifact.type === 'code' && artifact.language === 'mermaid' ? (
          <MermaidArtifact artifact={artifact} isDark={isDark} />
        ) : artifact.type === 'code' ? (
          <CodeArtifact artifact={artifact} />
        ) : artifact.type === 'table' ? (
          <TableArtifact artifact={artifact} />
        ) : artifact.type === 'mermaid' ? (
          <MermaidArtifact artifact={artifact} isDark={isDark} />
        ) : artifact.type === 'svg' ||
          (typeof artifact.content === 'string' &&
            artifact.content.trimStart().startsWith('<svg')) ? (
          <SvgArtifact artifact={artifact} />
        ) : artifact.type === 'markdown' ? (
          <MarkdownArtifact artifact={artifact} isDark={isDark} />
        ) : artifact.type === 'react' ? (
          <ReactPreview code={artifact.content} />
        ) : artifact.type === 'spreadsheet' ? (
          <SpreadsheetArtifact artifact={artifact} />
        ) : artifact.type === 'presentation' ? (
          <PresentationArtifact artifact={artifact} />
        ) : artifact.type === 'html' ? (
          <HtmlArtifact artifact={artifact} />
        ) : artifact.type === 'document' ? (
          <MarkdownArtifact artifact={artifact} isDark={isDark} />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Unsupported artifact type</div>
        )}
      </div>
    </div>
  );
}
