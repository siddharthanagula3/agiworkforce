import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
  ScrollArea,
  Alert,
  AlertDescription,
} from '@agiworkforce/ui';
import {
  Code,
  Eye,
  Download,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Maximize2,
  ExternalLink,
  History,
  Shield,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import {
  summarizeGeneratedFileBundle,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
  type SharedArtifact,
} from '@agiworkforce/types';
import { GeneratedFileCard } from '@agiworkforce/unified-chat';
import { TypeIcon } from './InlineArtifactCards';
import { cn } from '@shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import {
  sanitizeArtifact,
  sanitizeSVG,
  hasXSSRisk,
  buildSandboxSrcDoc,
} from '@shared/utils/html-sanitizer';
import { SandboxedIframe } from '../SandboxedIframe';
import type { ArtifactRenderPayload, ArtifactKind } from '@/lib/artifact-sandbox';

export interface ArtifactVersion {
  id: string;
  content: string;
  timestamp: Date;
  description?: string;
}

export interface ArtifactData {
  id: string;
  type: 'html' | 'react' | 'svg' | 'mermaid' | 'code' | 'document';
  language?: string;
  title?: string;
  content: string;
  computeSession?: ComputeSession;
  generatedFile?: GeneratedFile;
  artifactManifest?: ArtifactManifest;
  versions?: ArtifactVersion[];
  currentVersion?: number;
}

interface ArtifactPreviewProps {
  artifact: ArtifactData;
  onVersionChange?: (versionIndex: number) => void;
  onShare?: () => void;
  className?: string;
  /** 'card' (default) = inline card with fixed heights + TabsList row.
   *  'panel' = split-view panel: full-height flex-fill + single reference toolbar. */
  variant?: 'card' | 'panel';
  /** Called when user clicks the Close button in panel variant toolbar. */
  onClose?: () => void;
  /**
   * Real edit history from the shared store's content-keyed auto-versioning
   * (oldest → newest). When length > 1 the panel header shows a version chip
   * (`v{n}/{total}`) with prev/next navigation. Navigation is view-only: it
   * changes which version the viewer renders/copies/downloads without mutating
   * the store, so no data is lost. Omit or pass a single-entry array to hide
   * the chip.
   */
  versionHistory?: SharedArtifact[];
}

/**
 * ArtifactPreview Component - Claude Artifacts-like Live Preview
 *
 * Features:
 * - Live rendering of HTML/React/SVG code
 * - Preview/Code toggle (split view)
 * - Version control with history
 * - Instant sharing
 * - Multiple export formats
 * - Responsive iframe sandbox
 *
 * Dominates ChatGPT Canvas by:
 * - Live interactive preview (Canvas only shows static editor)
 * - Real-time rendering of web apps
 * - Instant version switching
 */
export function ArtifactPreview({
  artifact,
  onVersionChange,
  onShare,
  className,
  variant = 'card',
  onClose,
  versionHistory,
}: ArtifactPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [securityWarning, setSecurityWarning] = useState(false);
  // Preview render failure surfaced by the cross-origin sandbox (production
  // path only). Reset on refresh / version change. Drives the error state.
  const [renderError, setRenderError] = useState<string | null>(null);

  // Version navigation (panel-only, view-only). null = show latest.
  const versionCount = versionHistory?.length ?? 0;
  const [viewedVersionIndex, setViewedVersionIndex] = useState<number | null>(null);

  // PDF / DOCX viewer state (Fix 39 / Fix 40)
  const isPdf = artifact.type === 'document' && artifact.language?.toLowerCase() === 'pdf';
  const isDocx =
    artifact.type === 'document' &&
    (artifact.language?.toLowerCase() === 'docx' || artifact.language?.toLowerCase() === 'doc');
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxError, setDocxError] = useState<string | null>(null);

  // Convert DOCX base64/blob content to HTML via mammoth (Fix 40)
  useEffect(() => {
    if (!isDocx || !artifact.content) return;
    let cancelled = false;

    async function convertDocx() {
      try {
        const mammoth = (await import('mammoth')).default;
        // content may be a base64 data-URI or raw binary string
        let arrayBuffer: ArrayBuffer;
        if (artifact.content.startsWith('data:')) {
          const base64 = artifact.content.split(',')[1] ?? '';
          const binary = atob(base64);
          arrayBuffer = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i)).buffer;
        } else {
          // treat as raw binary string
          const binary = artifact.content;
          arrayBuffer = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i)).buffer;
        }
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setDocxHtml(result.value);
      } catch (err) {
        if (!cancelled) setDocxError(err instanceof Error ? err.message : 'DOCX conversion failed');
      }
    }

    void convertDocx();
    return () => {
      cancelled = true;
    };
  }, [isDocx, artifact.content]);
  // WEB-13 / WEB-20: bumped on refresh to force iframe re-mount.
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the in-page expanded layout in sync when the user leaves NATIVE fullscreen via
  // Escape or browser UI (which fires fullscreenchange without going through our button).
  // Without this the panel would stay visually "fullscreen" after Escape.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  const generatedFileSummary = useMemo(
    () =>
      summarizeGeneratedFileBundle({
        computeSession: artifact.computeSession,
        generatedFile: artifact.generatedFile,
        artifactManifest: artifact.artifactManifest,
        fallbackFileName: artifact.title,
        fallbackKind: artifact.generatedFile?.kind ?? artifact.language ?? artifact.type,
        fallbackMimeType: artifact.generatedFile?.mimeType,
        fallbackUri: artifact.generatedFile?.uri,
        fallbackStatus: artifact.computeSession?.status,
      }),
    [artifact],
  );
  const hasGeneratedFileManifest = Boolean(
    artifact.computeSession || artifact.generatedFile || artifact.artifactManifest,
  );
  const docxPreviewHtml = useMemo(() => {
    if (!docxHtml) return null;
    const sanitizedDocxHtml = sanitizeArtifact(docxHtml, 'html');

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline';">
    <style>
      body {
        margin: 0;
        padding: 24px;
        color: rgb(17 24 39);
        background: white;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.6;
      }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; max-width: 100%; }
      td, th { border: 1px solid rgb(209 213 219); padding: 6px 8px; }
    </style>
  </head>
  <body>${sanitizedDocxHtml}</body>
</html>`;
  }, [docxHtml]);

  // Side-map (explicit-snapshot) content: the card variant's version model.
  const sideMapContent =
    artifact.versions && artifact.currentVersion !== undefined
      ? (artifact.versions[artifact.currentVersion]?.content ?? artifact.content)
      : artifact.content;

  // Which version index the viewer is currently showing (defaults to latest).
  const shownVersionIndex = viewedVersionIndex ?? (versionCount > 0 ? versionCount - 1 : 0);

  // The content the viewer renders / copies / downloads. When the user has
  // navigated the version chip, this is the viewed version's content; otherwise
  // it falls back to the side-map/current content (byte-identical to the prior
  // behavior for the card variant, which never passes versionHistory).
  const activeContent =
    versionHistory && versionHistory[shownVersionIndex]
      ? versionHistory[shownVersionIndex]!.content
      : sideMapContent;

  // Reset version navigation + render error when the artifact identity changes
  // or a new version lands (so we snap to the latest and clear stale errors).
  useEffect(() => {
    setViewedVersionIndex(null);
    setRenderError(null);
  }, [artifact.id, versionCount]);

  const getPreviewHTML = useCallback((): string => {
    const content = activeContent;
    const renderType = artifact.type === 'document' ? 'code' : artifact.type;

    // SECURITY: Check for XSS risks — only set the warning if content was
    // downgraded. For HTML artifacts that will run in the sandbox the warning
    // is NOT shown because scripts are intentionally preserved; the sandbox
    // is the security boundary. For non-sandboxed paths (main-document
    // rendering) the strict sanitizer runs and the warning is appropriate.
    if (renderType !== 'html' && hasXSSRisk(content)) {
      queueMicrotask(() => setSecurityWarning(true));
    }

    switch (renderType) {
      case 'html':
        // buildSandboxSrcDoc produces a complete, non-double-wrapped srcDoc.
        // It detects whether `content` is a full document or a fragment and
        // handles each correctly (full doc: inject CSP into existing <head>;
        // fragment: wrap in a minimal shell). Do NOT wrap the result further.
        // The SandboxedIframe uses sandbox="allow-scripts allow-modals" with
        // NO allow-same-origin, so the null-origin sandbox is the security
        // boundary and scripts execute safely.
        return buildSandboxSrcDoc(content);

      case 'react': {
        // For React, we'd need to transpile JSX - for now, show as HTML
        const sanitizedReact = sanitizeArtifact(content, renderType);
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https:;">
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel">
      ${sanitizedReact}
    </script>
  </body>
</html>`;
      }

      case 'svg': {
        // SVG has additional sanitization via sanitizeSVG
        const sanitizedSVG = sanitizeSVG(content);
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
      body {
        margin: 0;
        padding: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    ${sanitizedSVG}
  </body>
</html>`;
      }

      case 'mermaid':
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ startOnLoad: true });</script>
  </head>
  <body>
    <div class="mermaid">
      ${content}
    </div>
  </body>
</html>`;

      default:
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: monospace;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>${content}</body>
</html>`;
    }
  }, [activeContent, artifact.type]);

  // WEB-13 / WEB-20: build the cross-origin sandbox payload from the artifact.
  // SandboxedIframe will post this to sandbox.agiworkforce.com (if configured)
  // or fall back to a same-origin srcDoc iframe with sandbox="allow-scripts"
  // (no allow-same-origin).
  //
  // For kind=html we use buildSandboxSrcDoc to produce a complete, non-wrapped
  // document. The null-origin sandbox (allow-scripts without allow-same-origin)
  // is the security boundary: scripts inside it cannot access the parent's
  // cookies, localStorage, or DOM.
  const sandboxPayload = useMemo<ArtifactRenderPayload>(() => {
    const content = activeContent;
    const renderType = artifact.type === 'document' ? 'code' : artifact.type;
    const kind: ArtifactKind = renderType === 'code' ? 'code' : (renderType as ArtifactKind);
    switch (renderType) {
      case 'html':
        // buildSandboxSrcDoc handles full-doc vs fragment correctly and injects
        // the CSP meta without double-wrapping. Pass the result as `html` so
        // the cross-origin sandbox renderer can use it directly as a srcDoc.
        return {
          type: 'render',
          kind: 'html',
          html: buildSandboxSrcDoc(content),
          runScripts: true,
        };
      case 'react':
        return { type: 'render', kind: 'react', code: sanitizeArtifact(content, renderType) };
      case 'svg':
        return { type: 'render', kind: 'svg', svg: sanitizeSVG(content) };
      case 'mermaid':
        return { type: 'render', kind: 'mermaid', code: content };
      default:
        return { type: 'render', kind, text: content };
    }
  }, [activeContent, artifact.type]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: 'html' | 'txt' | 'md') => {
    const content = activeContent;

    let blob: Blob;
    let filename: string;

    switch (format) {
      case 'html':
        blob = new Blob([getPreviewHTML()], { type: 'text/plain' });
        filename = `${artifact.title || 'artifact'}.html`;
        break;
      case 'md': {
        const markdown = `# ${artifact.title || 'Artifact'}\n\n\`\`\`${artifact.language || artifact.type}\n${content}\n\`\`\``;
        blob = new Blob([markdown], { type: 'text/markdown' });
        filename = `${artifact.title || 'artifact'}.md`;
        break;
      }
      default:
        blob = new Blob([content], { type: 'text/plain' });
        filename = `${artifact.title || 'artifact'}.${artifact.language || 'txt'}`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadGeneratedFile = async () => {
    if (!generatedFileSummary.primaryUri) return;

    if (generatedFileSummary.primaryUri.startsWith('http')) {
      const a = document.createElement('a');
      a.href = generatedFileSummary.primaryUri;
      a.download = generatedFileSummary.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    await navigator.clipboard.writeText(generatedFileSummary.primaryUri);
  };

  const handleShareGeneratedFile = async () => {
    const shareText = [
      `${generatedFileSummary.kindLabel}: ${generatedFileSummary.fileName}`,
      generatedFileSummary.privacyLabel
        ? `Privacy: ${generatedFileSummary.privacyLabel}`
        : undefined,
      generatedFileSummary.providerLabel
        ? `Provider: ${generatedFileSummary.providerLabel}`
        : undefined,
      generatedFileSummary.sourceSurfaceLabel
        ? `Source: ${generatedFileSummary.sourceSurfaceLabel}`
        : undefined,
      generatedFileSummary.sourceSessionLabel,
      generatedFileSummary.primaryUri,
    ]
      .filter(Boolean)
      .join('\n');

    if (navigator.share && generatedFileSummary.primaryUri?.startsWith('http')) {
      await navigator.share({
        title: generatedFileSummary.title,
        text: shareText,
        url: generatedFileSummary.primaryUri,
      });
      return;
    }

    await navigator.clipboard.writeText(shareText);
  };

  const handleOpenInNewTab = () => {
    // Keep executable artifact rendering inside SandboxedIframe. The new tab
    // shows source text so untrusted artifact HTML does not execute on a Blob
    // origin.
    const html = getPreviewHTML();

    const blob = new Blob([html], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleRefresh = () => {
    // WEB-13: bump refreshKey to re-mount the SandboxedIframe; the new
    // iframe load triggers a fresh sandbox-ready + payload post.
    setRenderError(null);
    setRefreshKey((k) => k + 1);
  };

  // Download a PDF/DOCX artifact as its real bytes. The content is either a
  // `data:` URI (anchor directly so the browser saves the decoded bytes, not
  // the URI text) or a raw binary string (wrap in a Blob). The generic
  // handleDownload('txt'/'html'/'md') paths would corrupt these by writing the
  // string representation, so binary docs get this dedicated handler instead.
  const handleDownloadBinaryDoc = () => {
    const ext = artifact.language || (isPdf ? 'pdf' : 'docx');
    const filename = `${artifact.title || 'artifact'}.${ext}`;
    const a = document.createElement('a');
    let objectUrl: string | null = null;
    if (artifact.content.startsWith('data:')) {
      a.href = artifact.content;
    } else {
      const blob = new Blob([artifact.content], { type: 'application/octet-stream' });
      objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
  };

  const handleFullscreen = () => {
    const enter = !isFullscreen;
    // The in-page expanded layout (isFullscreen) is the real fullscreen experience and
    // the source of truth. The native Fullscreen API is a best-effort ENHANCEMENT: it
    // can reject (permissions policy, no user activation, unsupported context), so its
    // promise is always caught. An uncaught rejection would otherwise surface as a dev
    // error overlay ("not granted") and, in production, an unhandled promise rejection.
    setIsFullscreen(enter);
    try {
      if (enter && !document.fullscreenElement && containerRef.current?.requestFullscreen) {
        void containerRef.current.requestFullscreen().catch(() => {});
      } else if (!enter && document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
    } catch {
      /* native fullscreen unsupported — the CSS-expanded layout still applies */
    }
  };

  const canPreview = ['html', 'react', 'svg', 'mermaid'].includes(artifact.type);

  // ============================================================================
  // PANEL VARIANT — single-toolbar, full-height flex-fill layout
  // ============================================================================
  if (variant === 'panel') {
    // Whether to show the preview content (vs source code)
    const showPreview = activeTab === 'preview' && (canPreview || isPdf || isDocx);
    // Human-readable type label for the toolbar, e.g. "· HTML", "· MD".
    // For code/document artifacts the type alone is generic ("CODE"/"DOCUMENT");
    // prefer the language field which carries the actual format (ts, md, pdf...).
    const typeLabel =
      artifact.type === 'code' || artifact.type === 'document'
        ? (artifact.language ?? artifact.type).toUpperCase()
        : artifact.type.toUpperCase();

    return (
      <div
        ref={containerRef}
        className={cn(
          'flex h-full min-h-0 flex-col',
          isFullscreen && 'fixed inset-0 z-modal',
          className,
        )}
      >
        {/* Single reference toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/30 bg-card/80 px-3 py-1.5">
          {/* LEFT: toggle + type icon + title + type + version chip */}
          <div className="flex min-w-0 items-center gap-2">
            {/* Eye/Code segmented toggle — only for renderable artifacts.
                PDF/DOCX are single-view (their "source" is an opaque data URI),
                so they get no toggle per the claude.ai artifact header. */}
            {canPreview && (
              <div className="flex shrink-0 items-center rounded-md border border-border/40 bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded transition-colors',
                    activeTab === 'preview'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label="Preview"
                  title="Preview"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded transition-colors',
                    activeTab === 'code'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label="Source"
                  title="Source"
                >
                  <Code className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            {/* Type icon */}
            <TypeIcon type={artifact.type} className="h-4 w-4 text-muted-foreground" />
            {/* Title + muted TYPE label */}
            <span className="truncate text-sm font-semibold text-foreground">
              {artifact.title || 'Artifact'}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">· {typeLabel}</span>
            {/* Version chip — only when the artifact has real edit history. */}
            {versionCount > 1 && (
              <div
                className="ml-0.5 flex shrink-0 items-center gap-0.5 rounded-md border border-border/40 bg-muted/40 px-0.5"
                data-testid="artifact-version-chip"
              >
                <button
                  type="button"
                  onClick={() => setViewedVersionIndex(Math.max(0, shownVersionIndex - 1))}
                  disabled={shownVersionIndex <= 0}
                  className="flex h-6 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  aria-label="Previous version"
                  title="Previous version"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span
                  className="min-w-[2.75rem] text-center text-xs tabular-nums text-muted-foreground"
                  aria-live="polite"
                >
                  v{shownVersionIndex + 1}/{versionCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setViewedVersionIndex(Math.min(versionCount - 1, shownVersionIndex + 1))
                  }
                  disabled={shownVersionIndex >= versionCount - 1}
                  className="flex h-6 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                  aria-label="Next version"
                  title="Next version"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: controls composed per artifact type (claude.ai parity).
              - renderable (html/react/svg/mermaid): Copy · Download · Refresh · Open · Fullscreen · Close
              - binary doc (pdf/docx): Download · Refresh · Close  (no Copy — content is an opaque data URI)
              - code / markdown doc: Copy · Download · Close
              External + Fullscreen collapse on narrow (375px) widths. */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Copy — not for binary docs (copying a data URI is useless). */}
            {!isPdf && !isDocx && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleCopy()}
                className="h-7 px-2"
                aria-label={copied ? 'Copied' : 'Copy artifact'}
                title="Copy"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="ml-1 hidden text-xs sm:inline">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="ml-1 hidden text-xs sm:inline">Copy</span>
                  </>
                )}
              </Button>
            )}

            {/* Download — binary docs save real bytes via a plain button;
                everything else offers the format dropdown. */}
            {isPdf || isDocx ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadBinaryDoc}
                className="h-7 px-2"
                aria-label="Download file"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    aria-label="Download artifact"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownload('html')}>
                    Download as HTML
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload('txt')}>
                    Download source (.{(artifact.language || 'txt').toLowerCase()})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload('md')}>
                    Download as Markdown
                  </DropdownMenuItem>
                  {hasGeneratedFileManifest && generatedFileSummary.primaryUri && (
                    <DropdownMenuItem onClick={() => void handleDownloadGeneratedFile()}>
                      Download generated file
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Refresh — renderable previews and PDFs (re-mounts the frame). */}
            {(canPreview || isPdf) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 px-2"
                aria-label="Refresh preview"
                title="Refresh preview"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}

            {/* Open in new tab — renderable only; hidden on narrow widths. */}
            {canPreview && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenInNewTab}
                className="hidden h-7 px-2 sm:flex"
                aria-label="Open source in new tab"
                title="Open source in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}

            {/* Fullscreen — renderable only; hidden on narrow widths. */}
            {canPreview && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFullscreen}
                className="hidden h-7 px-2 sm:flex"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title="Fullscreen"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}

            {/* Close — panel-only */}
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 w-7 p-0"
                aria-label="Close artifact viewer"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Security warning — keep for non-HTML artifacts with XSS patterns */}
        {securityWarning && (
          <Alert className="m-4 shrink-0 border-yellow-500 bg-yellow-50">
            <Shield className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <strong>Security Notice:</strong> This artifact contained potentially unsafe patterns
              that were removed before rendering.
            </AlertDescription>
          </Alert>
        )}

        {/* Generated file manifest block */}
        {hasGeneratedFileManifest && (
          <div className="shrink-0 border-b border-border bg-muted/10 px-4 py-3">
            <GeneratedFileCard
              presentation={generatedFileSummary}
              onDownload={
                generatedFileSummary.primaryUri
                  ? () => void handleDownloadGeneratedFile()
                  : undefined
              }
              onShare={
                generatedFileSummary.canShare ? () => void handleShareGeneratedFile() : undefined
              }
            />
            {generatedFileSummary.localOnly && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Local file. Web shares a reference only; it is not uploaded.
              </p>
            )}
          </div>
        )}

        {/* Content area — fills remaining height. min-h-0 prevents a flex-child
            from refusing to shrink below its content height (iframe collapse). */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          {/* Preview: HTML / React / SVG / Mermaid — with empty + error states. */}
          {showPreview &&
            canPreview &&
            (activeContent.trim().length === 0 ? (
              // Empty state: a renderable artifact with no content yet (e.g. an
              // opened-but-still-empty draft). Not an error, just nothing to show.
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background px-6 text-center">
                <Code className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
              </div>
            ) : renderError ? (
              // Error state: the sandbox reported a render failure. Offer source
              // + retry so the user is never stuck on a blank frame.
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center"
                data-testid="artifact-render-error"
              >
                <AlertTriangle className="h-7 w-7 text-amber-500" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    This artifact couldn&apos;t be rendered.
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">{renderError}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('code')}>
                    <Code className="mr-1 h-3.5 w-3.5" />
                    View source
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full w-full bg-white">
                <SandboxedIframe
                  payload={sandboxPayload}
                  fallbackSrcDoc={getPreviewHTML()}
                  title={artifact.title || 'Artifact Preview'}
                  className="h-full w-full border-0"
                  refreshKey={refreshKey}
                  onRenderError={(err) => setRenderError(err)}
                />
              </div>
            ))}

          {/* Preview: PDF */}
          {showPreview && isPdf && (
            <iframe
              key={`pdf-${refreshKey}`}
              title={artifact.title || 'PDF Preview'}
              src={artifact.content}
              sandbox="allow-same-origin"
              className="h-full w-full border-0"
              aria-label={artifact.title || 'PDF document'}
            />
          )}

          {/* Preview: DOCX */}
          {showPreview && isDocx && (
            <>
              {docxError ? (
                <div className="flex items-center justify-center p-8 text-sm text-destructive">
                  Could not render document: {docxError}
                </div>
              ) : docxPreviewHtml ? (
                <iframe
                  title={`${artifact.title || 'DOCX'} document preview`}
                  srcDoc={docxPreviewHtml}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full border-0 bg-background"
                />
              ) : (
                <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                  Converting document...
                </div>
              )}
            </>
          )}

          {/* Source / Code — shown whenever not previewing (or for pure-code artifacts) */}
          {!showPreview && (
            <ScrollArea className="h-full w-full bg-gray-900">
              <pre className="p-4">
                <code className="text-sm text-gray-100">{activeContent}</code>
              </pre>
            </ScrollArea>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // CARD VARIANT (default) — original behavior, byte-identical markup
  // ============================================================================
  return (
    <div
      ref={containerRef}
      className={cn(
        'mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-lg',
        isFullscreen && 'fixed inset-0 z-modal rounded-none',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{artifact.title || 'Artifact'}</span>
          </div>
          {artifact.type && (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {artifact.type}
            </span>
          )}
          {hasGeneratedFileManifest && (
            <>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {generatedFileSummary.statusLabel}
              </span>
              {generatedFileSummary.privacyShortLabel && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  {generatedFileSummary.privacyShortLabel}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Version History */}
          {artifact.versions && artifact.versions.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <History className="h-3.5 w-3.5" />
                  <span className="ml-1 text-xs">v{(artifact.currentVersion || 0) + 1}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {artifact.versions.map((version, index) => (
                  <DropdownMenuItem
                    key={version.id}
                    onClick={() => onVersionChange?.(index)}
                    className={cn(artifact.currentVersion === index && 'bg-accent')}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium">Version {index + 1}</span>
                      <span className="text-xs text-muted-foreground">
                        {version.timestamp.toLocaleString()}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                <span className="ml-1 text-xs">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="ml-1 text-xs">Copy</span>
              </>
            )}
          </Button>

          {/* Download Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label="Download artifact"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDownload('html')}>
                Download as HTML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload('txt')}>
                Download source (.{(artifact.language || 'txt').toLowerCase()})
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload('md')}>
                Download as Markdown
              </DropdownMenuItem>
              {hasGeneratedFileManifest && generatedFileSummary.primaryUri && (
                <DropdownMenuItem onClick={() => void handleDownloadGeneratedFile()}>
                  Download generated file
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {(onShare || hasGeneratedFileManifest) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                hasGeneratedFileManifest ? void handleShareGeneratedFile() : onShare?.()
              }
              className="h-7 px-2"
              aria-label="Share artifact"
              title="Share"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}

          {canPreview && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 px-2"
                aria-label="Refresh preview"
                title="Refresh preview"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenInNewTab}
                className="h-7 px-2"
                aria-label="Open source in new tab"
                title="Open source in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleFullscreen}
                className="h-7 px-2"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title="Fullscreen"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Security Warning — only shown for non-HTML types where dangerous
          patterns were detected and stripped (e.g. script tags in SVG/code
          artifacts that render in the main document). HTML artifacts run
          inside a null-origin sandbox where scripts are intentionally
          preserved, so no warning is needed for that path. */}
      {securityWarning && (
        <Alert className="m-4 border-yellow-500 bg-yellow-50">
          <Shield className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Security Notice:</strong> This artifact contained potentially unsafe patterns
            that were removed before rendering.
          </AlertDescription>
        </Alert>
      )}

      {hasGeneratedFileManifest && (
        <div className="border-b border-border bg-muted/10 px-4 py-3">
          <GeneratedFileCard
            presentation={generatedFileSummary}
            onDownload={
              generatedFileSummary.primaryUri ? () => void handleDownloadGeneratedFile() : undefined
            }
            onShare={
              generatedFileSummary.canShare ? () => void handleShareGeneratedFile() : undefined
            }
          />
          {generatedFileSummary.localOnly && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Local file. Web shares a reference only; it is not uploaded.
            </p>
          )}
        </div>
      )}

      {/* Preview/Code Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'preview' | 'code')}
        className="w-full"
      >
        {(canPreview || isPdf || isDocx) && (
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-muted/30 px-4">
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Code className="h-3.5 w-3.5" />
              Code
            </TabsTrigger>
          </TabsList>
        )}

        {/* Preview Tab · HTML/React/SVG/Mermaid */}
        {canPreview && (
          <TabsContent value="preview" className="m-0 p-0">
            <div className={cn('bg-white', isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}>
              <SandboxedIframe
                payload={sandboxPayload}
                fallbackSrcDoc={getPreviewHTML()}
                title={artifact.title || 'Artifact Preview'}
                className="h-full w-full border-0"
                refreshKey={refreshKey}
              />
            </div>
          </TabsContent>
        )}

        {/* Preview Tab · PDF inline viewer (Fix 39) */}
        {isPdf && (
          <TabsContent value="preview" className="m-0 p-0">
            <div className={cn(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[600px]')}>
              <iframe
                title={artifact.title || 'PDF Preview'}
                src={artifact.content}
                sandbox="allow-same-origin"
                className="h-full w-full border-0"
                aria-label={artifact.title || 'PDF document'}
              />
            </div>
          </TabsContent>
        )}

        {/* Preview Tab · DOCX viewer via mammoth (Fix 40) */}
        {isDocx && (
          <TabsContent value="preview" className="m-0 p-0">
            {docxError ? (
              <div className="flex items-center justify-center p-8 text-sm text-destructive">
                Could not render document: {docxError}
              </div>
            ) : docxPreviewHtml ? (
              <iframe
                title={`${artifact.title || 'DOCX'} document preview`}
                srcDoc={docxPreviewHtml}
                sandbox=""
                referrerPolicy="no-referrer"
                className={cn(
                  'w-full border-0 bg-background',
                  isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[600px]',
                )}
              />
            ) : (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Converting document...
              </div>
            )}
          </TabsContent>
        )}

        {/* Code Tab */}
        <TabsContent value="code" className="m-0 p-0">
          <ScrollArea
            className={cn('bg-gray-900', isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}
          >
            <pre className="p-4">
              <code className="text-sm text-gray-100">{activeContent}</code>
            </pre>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
