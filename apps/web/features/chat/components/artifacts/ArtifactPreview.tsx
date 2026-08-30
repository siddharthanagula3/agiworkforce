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
  Shield,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileText,
  Globe,
  Pencil,
} from 'lucide-react';
import type { PublishResult } from '@agiworkforce/artifacts';
import {
  summarizeGeneratedFileBundle,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
  type SharedArtifact,
} from '@agiworkforce/types';
import {
  ChartArtifact,
  GeneratedFileCard,
  MarkdownContent,
  SpreadsheetArtifact,
  PresentationArtifact,
  EmailArtifact,
  spreadsheetSafeExport,
} from '@agiworkforce/unified-chat';
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
  buildArtifactCspMeta,
  escapeForInlineScript,
  escapeHTML,
} from '@shared/utils/html-sanitizer';
import { SandboxedIframe } from '../SandboxedIframe';
import type { ArtifactRenderPayload, ArtifactKind } from '@/lib/artifact-sandbox';
import { downloadGeneratedFile } from '../../utils/downloadArtifacts';
import { toast } from 'sonner';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { toUserMessage } from '@/lib/user-error-message';

/**
 * AUDIT-FIX ART-24: single guarded clipboard write.
 *
 * `navigator.clipboard` does not exist in an insecure context and `writeText`
 * rejects on denied permission / unfocused document. Returns whether the copy
 * actually happened so callers can tell the user the truth instead of showing
 * a "Copied" tick for a copy that never occurred.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** AUDIT-FIX ART-6: banner copy per mitigation that genuinely ran. */
const SECURITY_NOTICE_TEXT: Record<'sanitized' | 'escaped', string> = {
  sanitized:
    'This artifact contained potentially unsafe patterns. They were removed before rendering.',
  escaped:
    'This artifact contained potentially unsafe patterns. They were rendered as text and never executed.',
};

export interface ArtifactData {
  id: string;
  type:
    | 'html'
    | 'react'
    | 'svg'
    | 'mermaid'
    | 'code'
    | 'document'
    // Shared-renderer types (spreadsheet/table/csv, presentation, email, chart)
    // — rendered by @agiworkforce/unified-chat components, not the sandbox.
    | 'spreadsheet'
    | 'table'
    | 'csv'
    | 'presentation'
    | 'email'
    | 'chart'
    | 'image';
  language?: string;
  title?: string;
  content: string;
  computeSession?: ComputeSession;
  generatedFile?: GeneratedFile;
  artifactManifest?: ArtifactManifest;
}

interface ArtifactPreviewProps {
  artifact: ArtifactData;
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
   * the store, so no data is lost; the separate Restore button is the only
   * writer. A single-entry array still shows `v1/1` with both arrows disabled —
   * omit the prop entirely (inline cards do) to hide the chip.
   */
  versionHistory?: SharedArtifact[];
  /**
   * CAP-015 slice 3: host-injected publish action.
   *
   * `ArtifactsPanel` supplies one backed by `@agiworkforce/artifacts`
   * `publishArtifact()` + the web `CloudPublisher`, which is what turns the
   * Publish menu item from a clipboard copy into a real public URL. Left
   * undefined (inline cards, tests), no Publish item renders at all — an
   * action that cannot work must not be offered.
   */
  publishArtifact?: () => Promise<PublishResult>;
}

/**
 * Images render through an inert `<img>`, never an iframe. Accept the sources
 * that the product's persisted media pipeline can legitimately produce and
 * reject executable/unknown schemes before they reach the DOM.
 */
function resolveArtifactImageSource(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);/i.test(value)) return value;
  if (value.startsWith('blob:')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;

  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.href;
    if (
      url.protocol === 'http:' &&
      typeof window !== 'undefined' &&
      url.origin === window.location.origin
    ) {
      return url.href;
    }
  } catch {
    // Opaque or malformed values are not renderable image sources.
  }
  return null;
}

/**
 * ArtifactPreview Component - Claude Artifacts-like Live Preview
 *
 * Features:
 * - Live rendering of HTML/React/SVG code
 * - Preview/Code toggle (split view)
 * - Version navigation + restore, panel variant only, and only when the caller
 *   passes `versionHistory` (the shared store's real edit history). The card
 *   variant has no version UI at all.
 * - Publish to a public URL when the caller injects `publishArtifact`
 * - Multiple export formats
 * - Responsive iframe sandbox
 */
export function ArtifactPreview({
  artifact,
  onShare,
  className,
  variant = 'card',
  onClose,
  versionHistory,
  publishArtifact,
}: ArtifactPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Preview render failure surfaced by the cross-origin sandbox (production
  // path only). Reset on refresh / version change. Drives the error state.
  const [renderError, setRenderError] = useState<string | null>(null);
  // CAP-015 slice 3: publish-in-flight flag and the last public URL minted for
  // THIS artifact. Both are cleared on an artifact swap (see the reset effect)
  // so one artifact's link can never be shown under another's title.
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Version navigation (panel-only, view-only). null = show latest.
  const versionCount = versionHistory?.length ?? 0;
  const restoreArtifactVersion = useArtifactsStore((s) => s.restoreArtifactVersion);
  const upsertArtifact = useArtifactsStore((s) => s.upsertArtifact);
  const isStoredArtifact = useArtifactsStore((s) => s.artifacts.some((a) => a.id === artifact.id));
  const [viewedVersionIndex, setViewedVersionIndex] = useState<number | null>(null);
  // Manual source edit. null = not editing; a string = the unsaved draft.
  const [sourceDraft, setSourceDraft] = useState<string | null>(null);

  // PDF / DOCX viewer state (Fix 39 / Fix 40)
  const isPdf = artifact.type === 'document' && artifact.language?.toLowerCase() === 'pdf';
  const isDocx =
    artifact.type === 'document' &&
    (artifact.language?.toLowerCase() === 'docx' || artifact.language?.toLowerCase() === 'doc');
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxError, setDocxError] = useState<string | null>(null);
  const isImage = artifact.type === 'image';
  const [imageError, setImageError] = useState(false);
  // PDF viewer load-failure (iframe onError). Distinct from "no valid source":
  // this is set when a real source is handed to the iframe but the browser
  // fails to render it. Reset on refresh / artifact change.
  const [pdfError, setPdfError] = useState(false);

  // Convert DOCX base64/blob content to HTML via mammoth (Fix 40)
  //
  // AUDIT-FIX ART-7: the conversion output is cleared at the TOP of this effect
  // and the effect is keyed on the artifact id as well as its content. Before,
  // nothing reset `docxHtml`/`docxError` on an artifact swap, so opening DOCX B
  // rendered DOCX A's converted HTML under B's title until B finished (and a
  // failed conversion's error message stuck to the next document forever).
  // Resetting here rather than in the id-keyed reset effect below keeps the
  // clear and the re-convert in one place — they can never fall out of step.
  useEffect(() => {
    setDocxHtml(null);
    setDocxError(null);
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
        if (!cancelled) setDocxError(toUserMessage(err, 'DOCX conversion failed'));
      }
    }

    void convertDocx();
    return () => {
      cancelled = true;
    };
  }, [isDocx, artifact.id, artifact.content]);
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

  // Resolve a SAFE, real PDF byte-source for the inline viewer.
  //
  // Provenance matters here: for a *generated* document artifact,
  // `artifact.content` is the model's TEXT (markdown), NOT PDF bytes — feeding
  // it to <iframe src> renders garbage. The real bytes, when they exist, live
  // at `generatedFile.uri` (surfaced as `generatedFileSummary.primaryUri`). An
  // *attachment* path can instead carry a `blob:`/`data:` URI directly in
  // `artifact.content`.
  //
  // We only accept sources the browser can render locally WITHOUT an outbound
  // fetch to an arbitrary origin (SSRF / egress-allowlist safety):
  //   - `data:application/pdf...`  (inline bytes)
  //   - `blob:...`                 (same-origin object URL)
  //   - same-origin http(s) URL that is a PDF
  // Anything else (off-origin https, an opaque compute-storage URI, or plain
  // text) yields `null` → the viewer shows an honest "download instead" state
  // rather than a fake/blank preview.
  const pdfSrc = useMemo<string | null>(() => {
    if (!isPdf) return null;
    const mime = (generatedFileSummary.mimeType ?? '').toLowerCase();
    const candidates = [artifact.content, generatedFileSummary.primaryUri];
    for (const raw of candidates) {
      if (!raw) continue;
      const value = raw.trim();
      if (value.toLowerCase().startsWith('data:application/pdf')) return value;
      if (value.startsWith('blob:')) return value;
      // Same-origin http(s) URL pointing at a PDF (never an arbitrary origin).
      if (typeof window !== 'undefined' && /^https?:\/\//i.test(value)) {
        try {
          const url = new URL(value);
          if (
            url.origin === window.location.origin &&
            (url.pathname.toLowerCase().endsWith('.pdf') || mime.includes('pdf'))
          ) {
            if (url.pathname.startsWith('/api/files/')) url.searchParams.set('preview', 'pdf');
            return url.href;
          }
        } catch {
          /* not a parseable URL — fall through */
        }
      }
      // Relative same-origin path.
      if (value.startsWith('/') && (value.toLowerCase().endsWith('.pdf') || mime.includes('pdf'))) {
        if (value.startsWith('/api/files/')) {
          const url = new URL(value, window.location.origin);
          url.searchParams.set('preview', 'pdf');
          return `${url.pathname}${url.search}${url.hash}`;
        }
        return value;
      }
    }
    return null;
  }, [isPdf, artifact.content, generatedFileSummary.primaryUri, generatedFileSummary.mimeType]);

  // The native PDF viewer (a browser-internal resource) is blocked inside ANY
  // sandboxed iframe, so the viewer iframe below is intentionally NOT
  // sandboxed. `pdfSrc` is therefore the trust boundary:
  //   - `data:application/pdf` — the data: MIME forces PDF interpretation; it
  //     can never be executed as HTML, so it is safe unsandboxed.
  //   - same-origin http(s)/relative `.pdf` — our own origin's content.
  //   - `blob:` — the object's stored type is NOT provable from the URL string
  //     (an HTML blob would execute same-origin in an unsandboxed frame), so we
  //     verify the blob's MIME is application/pdf before rendering it.
  // `null` = pending verification, `false` = not a PDF (→ fallback), `true` = ok.
  const isBlobPdf = Boolean(pdfSrc?.startsWith('blob:'));
  const [pdfBlobOk, setPdfBlobOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pdfSrc || !pdfSrc.startsWith('blob:')) {
      setPdfBlobOk(null);
      return;
    }
    let cancelled = false;
    setPdfBlobOk(null);
    // blob: URLs are same-origin object URLs — this fetch never leaves the
    // browser, so it introduces no egress/SSRF surface.
    fetch(pdfSrc)
      .then((r) => r.blob())
      .then((b) => {
        if (!cancelled) setPdfBlobOk(b.type === 'application/pdf');
      })
      .catch(() => {
        if (!cancelled) setPdfBlobOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfSrc]);

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

  // Which version index the viewer is currently showing (defaults to latest).
  const shownVersionIndex = viewedVersionIndex ?? (versionCount > 0 ? versionCount - 1 : 0);

  // The content the viewer renders / copies / downloads. When the user has
  // navigated the version chip, this is the viewed version's content; otherwise
  // it is the artifact's current content (the card variant never passes
  // versionHistory, so it always lands on the latter).
  const activeContent =
    versionHistory && versionHistory[shownVersionIndex]
      ? versionHistory[shownVersionIndex]!.content
      : artifact.content;
  const imageSrc = useMemo(
    () => (isImage ? resolveArtifactImageSource(activeContent) : null),
    [isImage, activeContent],
  );

  // Reset version navigation + render error when the artifact identity changes
  // or a new version lands (so we snap to the latest and clear stale errors).
  //
  // AUDIT-FIX ART-7: this used to reset ONLY viewedVersionIndex / renderError /
  // pdfError, so `copied` survived an artifact swap and showed a "Copied" tick
  // for the wrong artifact. The other two leaks are fixed at their source:
  // `docxHtml`/`docxError` are cleared by the conversion effect above, and
  // `securityWarning` is no longer latched state at all — see securityNotice.
  useEffect(() => {
    setViewedVersionIndex(null);
    setRenderError(null);
    setPdfError(false);
    setImageError(false);
    setCopied(false);
    // An unsaved draft belongs to the revision it was opened from. Carrying it
    // across an artifact swap or a new version would overwrite other content.
    setSourceDraft(null);
    // CAP-015: a published URL belongs to one artifact id. Leaving it up after
    // a swap would offer the previous artifact's public link under this title.
    setPublishedUrl(null);
  }, [artifact.id, versionCount]);

  /**
   * Manual source editing (panel variant). Web artifacts could only ever be
   * revised by another model turn, while two marketing surfaces call them
   * editable. A save goes through the SAME content-keyed store path Restore
   * uses, so the edit becomes a real new version rather than a silent overwrite.
   *
   * Offered only for artifacts whose source IS text and only on the latest
   * version: PDF/DOCX/image content is an opaque data URI, and an older
   * revision has to be restored before it can be edited.
   */
  const isLatestVersion = versionCount === 0 || shownVersionIndex === versionCount - 1;
  const canEditSource =
    variant === 'panel' && isStoredArtifact && isLatestVersion && !isPdf && !isDocx && !isImage;

  const saveSourceEdit = useCallback(() => {
    if (sourceDraft === null) return;
    const stored = useArtifactsStore.getState().artifacts.find((a) => a.id === artifact.id);
    if (!stored) return;
    if (sourceDraft !== stored.content) {
      upsertArtifact({ ...stored, content: sourceDraft, createdAt: new Date() });
    }
    setSourceDraft(null);
  }, [artifact.id, sourceDraft, upsertArtifact]);

  // AUDIT-FIX ART-6 / ART-14: the security banner is DERIVED, never latched,
  // and it now states what actually happened per renderer:
  //   - svg      → sanitizeSVG() really does strip tags/attrs → "removed".
  //   - mermaid  → the diagram source is HTML-escaped before it reaches the
  //                sandbox document, so markup is inert but nothing was
  //                deleted → "shown as text".
  //   - html/react → scripts are INTENTIONALLY executed inside the null-origin
  //                sandbox; claiming a mitigation there would be a lie.
  //   - code/document → rendered as React text nodes; no claim to make.
  const securityNotice = useMemo<'sanitized' | 'escaped' | null>(() => {
    if (artifact.type !== 'svg' && artifact.type !== 'mermaid') return null;
    if (!hasXSSRisk(activeContent)) return null;
    return artifact.type === 'svg' ? 'sanitized' : 'escaped';
  }, [artifact.type, activeContent]);

  const getPreviewHTML = useCallback((): string => {
    const content = activeContent;
    const renderType = artifact.type === 'document' ? 'code' : artifact.type;

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
        // AUDIT-FIX ART-1: React source must reach Babel AS SOURCE.
        //
        // This branch used to pass `content` through
        // `sanitizeArtifact(content, 'react')`, which returns
        // `<pre><code>${escapeHTML(content)}</code></pre>`. That escaped string
        // was then dropped inside `<script type="text/babel">`, so Babel was
        // handed `&lt;div&gt;` markup instead of JSX and threw on every single
        // React artifact — the type could never render, in any configuration.
        //
        // The source is now embedded verbatim (only `</script` is neutralised,
        // which the JS parser cannot distinguish from `</script`). Executing it
        // is the whole point: the null-origin sandbox (allow-scripts WITHOUT
        // allow-same-origin) plus the CSP below is the boundary, exactly as it
        // is for `html`.
        //
        // AUDIT-FIX ART-14: the old CSP here was `default-src 'self'
        // 'unsafe-inline' 'unsafe-eval' https:` — that permitted fetch/XHR to
        // ANY https origin from inside the frame. The shared policy pins
        // `connect-src 'none'` and allows scripts only from the CDN allowlist.
        //
        // The mount bootstrap mirrors infrastructure/sandbox/index.html's
        // renderReact() so the same artifact behaves identically on the
        // cross-origin sandbox path and on this fallback path.
        const reactSource = escapeForInlineScript(content);
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${buildArtifactCspMeta()}
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel" data-presets="env,react">
${reactSource}
;var __AgiApp = (typeof App !== 'undefined' && App) || (typeof Component !== 'undefined' && Component);
if (__AgiApp) {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__AgiApp));
}
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
        // AUDIT-FIX ART-6: `content` used to be interpolated RAW into the
        // document — a diagram body containing `<img onerror=…>` executed in
        // the frame while the banner told the user unsafe patterns had been
        // "removed". Mermaid reads the element's text, so HTML-escaping the
        // source is both safe and lossless (the parser un-escapes back to the
        // original characters before mermaid ever sees them).
        // AUDIT-FIX ART-14: this document had no CSP at all; it now carries
        // the shared one (jsdelivr is in the script allowlist).
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    ${buildArtifactCspMeta()}
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ startOnLoad: true, securityLevel: 'strict' });</script>
  </head>
  <body>
    <div class="mermaid">
      ${escapeHTML(content)}
    </div>
  </body>
</html>`;

      default:
        // AUDIT-FIX ART-6: the text/code fallback interpolated `content` raw
        // into `<body>`, so any artifact that fell through here rendered (and
        // executed) attacker-authored markup. `white-space: pre-wrap` means the
        // escaped text displays exactly as written.
        // AUDIT-FIX ART-14: plus the shared CSP, which this document lacked.
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    ${buildArtifactCspMeta()}
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: monospace;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>${escapeHTML(content)}</body>
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
        // AUDIT-FIX ART-1: the cross-origin sandbox puts `code` straight into a
        // `text/babel` script element (see infrastructure/sandbox/index.html
        // renderReact). Shipping `sanitizeArtifact(content, 'react')` meant
        // shipping `<pre><code>&lt;div&gt;…` — Babel threw on every React
        // artifact. Ship the source; the sandbox origin is the boundary.
        return { type: 'render', kind: 'react', code: content };
      case 'svg':
        return { type: 'render', kind: 'svg', svg: sanitizeSVG(content) };
      case 'mermaid':
        return { type: 'render', kind: 'mermaid', code: content };
      default:
        return { type: 'render', kind, text: content };
    }
  }, [activeContent, artifact.type]);

  // AUDIT-FIX ART-24: `navigator.clipboard` is undefined in insecure contexts
  // and `writeText` rejects when the permission is denied or the document is
  // not focused. The unguarded call threw an unhandled rejection and left the
  // button silently stuck on "Copy" with no explanation.
  const handleCopy = async () => {
    if (!(await writeToClipboard(activeContent))) {
      toast.error('Could not copy to clipboard');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // CAP-015 slice 3: publish to a public URL.
  //
  // The result is the discriminated union from `@agiworkforce/artifacts`, and
  // each arm is reported for what it is:
  //   cloud       → a real hosted URL; copy it and say so.
  //   local       → a file:// export (desktop host); state the path, do not
  //                 pretend a link was shared.
  //   unavailable → no publisher on this host; fall back to copying the SOURCE
  //                 to the clipboard, which is the honest degradation the panel
  //                 shipped before any publisher existed.
  // A throw is surfaced verbatim — including "this type has no public
  // renderer", which is a real answer, not a failure to hide.
  // ---------------------------------------------------------------------------
  const handlePublish = useCallback(async () => {
    if (!publishArtifact || isPublishing) return;
    setIsPublishing(true);
    try {
      const result = await publishArtifact();
      if (result.kind === 'cloud') {
        setPublishedUrl(result.shareUrl);
        if (await writeToClipboard(result.shareUrl)) {
          toast.success('Published · link copied to clipboard');
        } else {
          toast.success('Published. Copy the link from the bar below.');
        }
        return;
      }
      if (result.kind === 'local') {
        setPublishedUrl(result.shareUrl);
        toast.success('Exported to a local file');
        return;
      }
      setPublishedUrl(null);
      if (await writeToClipboard(activeContent)) {
        toast.message(result.reason, { description: 'Artifact source copied to the clipboard.' });
      } else {
        toast.error(result.reason);
      }
    } catch (error) {
      setPublishedUrl(null);
      toast.error(toUserMessage(error, 'Failed to publish artifact'));
    } finally {
      setIsPublishing(false);
    }
  }, [publishArtifact, isPublishing, activeContent]);

  const handleDownload = (format: 'html' | 'txt' | 'md') => {
    const content = activeContent;

    let blob: Blob;
    let filename: string;

    switch (format) {
      case 'html':
        // AUDIT-FIX ART-26: this shipped the sandbox scaffold under a `.html`
        // name with a `text/plain` MIME — the OS/browser opened it as text, and
        // for React artifacts the payload was ART-1's escaped `<pre><code>`
        // dump rather than runnable source. With ART-1 + ART-6 fixed,
        // getPreviewHTML() is a genuine standalone document for every type
        // (correct DOCTYPE, the CSP envelope, real source). Keep the `.html`
        // filename but force attachment semantics with an inert MIME. A
        // `text/html` object URL can become an origin-XSS sink if the browser,
        // an extension, or future code navigates to it instead of honoring the
        // download attribute.
        blob = new Blob([getPreviewHTML()], { type: 'application/octet-stream' });
        filename = `${artifact.title || 'artifact'}.html`;
        break;
      case 'md': {
        const markdown = `# ${artifact.title || 'Artifact'}\n\n\`\`\`${artifact.language || artifact.type}\n${content}\n\`\`\``;
        blob = new Blob([markdown], { type: 'text/markdown' });
        filename = `${artifact.title || 'artifact'}.md`;
        break;
      }
      default: {
        // "Download source (.<language>)" writes the raw body, so a model-chosen
        // language of csv/tsv lands a formula in a spreadsheet file just as the CSV item would
        const extension = artifact.language || 'txt';
        const source = spreadsheetSafeExport(content, extension);
        blob = new Blob([source.body], { type: source.mimeType });
        filename = `${artifact.title || 'artifact'}.${extension}`;
      }
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
    try {
      await downloadGeneratedFile(
        generatedFileSummary.primaryUri,
        generatedFileSummary.fileName,
        generatedFileSummary.mimeType,
      );
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not download this file'));
    }
  };

  const handleDownloadImage = async () => {
    if (!imageSrc) return;
    const language = (artifact.language || 'png').toLowerCase().replace(/^\.+/, '');
    const extension = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(language)
      ? language
      : 'png';
    const title = artifact.title || 'generated-image';
    const fileName = /\.[a-z0-9]{1,8}$/i.test(title) ? title : `${title}.${extension}`;
    const mimeType =
      artifact.generatedFile?.mimeType ??
      (extension === 'jpg' ? 'image/jpeg' : `image/${extension}`);
    try {
      await downloadGeneratedFile(imageSrc, fileName, mimeType);
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not download this image'));
    }
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

    // AUDIT-FIX ART-24: guarded — an unavailable clipboard used to reject
    // unhandled and the user got no signal at all.
    if (!(await writeToClipboard(shareText))) {
      toast.error('Could not copy the share details to the clipboard');
    }
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
    setPdfError(false);
    setImageError(false);
    setRefreshKey((k) => k + 1);
  };

  // Download a PDF/DOCX artifact as its real bytes. The content is either a
  // `data:` URI (anchor directly so the browser saves the decoded bytes, not
  // the URI text) or a raw binary string (wrap in a Blob). The generic
  // handleDownload('txt'/'html'/'md') paths would corrupt these by writing the
  // string representation, so binary docs get this dedicated handler instead.
  const handleDownloadBinaryDoc = () => {
    const ext = artifact.language || (isPdf ? 'pdf' : 'docx');
    const title = artifact.title || 'artifact';
    const filename = title.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? title
      : `${title}.${ext}`;
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

  /**
   * A Markdown document has a rendered view, and it is the one the user
   * expects. Before this, `.md` fell through to `type === 'document'` with no
   * entry in any preview branch, so the panel could only ever show its source
   * — a Markdown artifact opened as a wall of `#` and backticks.
   *
   * It renders in-app rather than in the sandbox iframe: the sandbox's
   * `markdown` kind is an alias for `text` (it prints a `<pre>`), so routing
   * there would reproduce the same raw output. `MarkdownContent` is the same
   * sanitize→KaTeX→highlight chain that already renders untrusted model output
   * in every chat message, so this adds no new trust boundary.
   *
   * PDF and DOCX are excluded by construction: both are `document` too, and
   * both already own dedicated viewers below.
   */
  const isMarkdownDoc =
    !isPdf &&
    !isDocx &&
    (artifact.type === 'document'
      ? ['md', 'mdx', 'markdown', undefined].includes(artifact.language?.toLowerCase())
      : false);

  // Shared unified-chat renderers (spreadsheet/table/csv, presentation, email):
  // rendered directly in the panel — no sandbox iframe, so the iframe-only
  // controls (refresh / open-in-tab) stay hidden for these types.
  const isTabular = ['spreadsheet', 'table', 'csv'].includes(artifact.type);
  const isPresentation = artifact.type === 'presentation';
  const isEmail = artifact.type === 'email';
  // A chart artifact carries a JSON spec, not markup: the sandbox iframe only
  // ever printed the escaped JSON.
  const isChart = artifact.type === 'chart';
  const isSharedRendered = isTabular || isPresentation || isEmail || isChart;

  // The unified-chat Artifact view of this artifact (content follows the
  // version navigation, exactly like the sandbox preview does).
  const sharedArtifactView = useMemo(
    () => ({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      content: activeContent,
      language: artifact.language,
    }),
    [artifact.id, artifact.type, artifact.title, artifact.language, activeContent],
  );

  const handleDownloadCsv = () => {
    const sheet = spreadsheetSafeExport(activeContent, 'csv');
    const blob = new Blob([sheet.body], { type: sheet.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'spreadsheet'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderMarkdownPreview = (containerClassName: string) => (
    <div
      className={cn('overflow-auto bg-background px-6 py-5', containerClassName)}
      data-testid="artifact-markdown-preview"
    >
      <div className="mx-auto max-w-3xl">
        <MarkdownContent content={activeContent} />
      </div>
    </div>
  );

  const renderSharedPreview = (containerClassName: string) => (
    <div className={cn('overflow-auto bg-background p-0', containerClassName)}>
      {isTabular ? (
        <SpreadsheetArtifact
          artifact={sharedArtifactView}
          className="h-full rounded-none border-0"
        />
      ) : isPresentation ? (
        <PresentationArtifact artifact={sharedArtifactView} className="h-full rounded-none" />
      ) : isChart ? (
        <ChartArtifact artifact={sharedArtifactView} className="h-full rounded-none border-0" />
      ) : (
        <EmailArtifact artifact={sharedArtifactView} className="rounded-none border-0" />
      )}
    </div>
  );

  // A download action for the PDF fallback, only when real bytes exist:
  // a generated-file uri (compute output) or an inline data:/blob: content.
  const pdfDownload: (() => void) | null = generatedFileSummary.primaryUri
    ? () => void handleDownloadGeneratedFile()
    : artifact.content.startsWith('data:') || artifact.content.startsWith('blob:')
      ? handleDownloadBinaryDoc
      : null;

  // Shared PDF preview body used by both the panel and card variants. Renders
  // the native browser PDF viewer ONLY when a validated same-origin/blob/data
  // source exists and hasn't failed to load; otherwise an honest fallback with
  // a real Download (never a fake/blank preview). `containerClassName` supplies
  // the height (full-height in the panel, fixed height in the card).
  // A blob source that is still being MIME-verified: show a brief loading state
  // rather than flashing the iframe or the fallback.
  const pdfBlobPending = isBlobPdf && pdfBlobOk === null;
  // A source is renderable only when it exists, hasn't errored, and — for blob:
  // sources — has been verified as an actual PDF.
  const canRenderPdf = Boolean(pdfSrc) && !pdfError && (!isBlobPdf || pdfBlobOk === true);

  const renderPdfPreview = (containerClassName: string) => (
    <div className={cn('bg-muted/20', containerClassName)}>
      {pdfBlobPending ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading PDF…
        </div>
      ) : canRenderPdf ? (
        // Intentionally NOT sandboxed — the native PDF viewer is blocked in a
        // sandboxed frame. `pdfSrc` (+ blob MIME verification) is the trust
        // boundary; see the comment on the pdfSrc/pdfBlobOk block above.
        <iframe
          key={`pdf-${refreshKey}`}
          title={artifact.title || 'PDF Preview'}
          src={pdfSrc ?? undefined}
          onError={() => setPdfError(true)}
          className="h-full w-full border-0"
          aria-label={artifact.title || 'PDF document'}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center"
          data-testid="artifact-pdf-fallback"
        >
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {pdfError ? "This PDF couldn't be displayed." : 'Inline preview unavailable'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {pdfError
                ? 'The document failed to render in the viewer. Download it to open the file.'
                : 'This PDF has no inline-renderable source yet. Download it to view the file.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pdfError && (
              <Button variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </Button>
            )}
            {pdfDownload && (
              <Button variant="outline" size="sm" onClick={pdfDownload}>
                <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Download
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderImagePreview = (containerClassName: string) => (
    <div
      className={cn(
        'flex items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,hsl(var(--muted))_0,transparent_70%)] p-4',
        containerClassName,
      )}
    >
      {imageSrc && !imageError ? (
        <img
          key={`${imageSrc}-${refreshKey}`}
          src={imageSrc}
          alt={artifact.title || 'Generated image'}
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
          className="max-h-full max-w-full rounded-xl object-contain shadow-sm"
        />
      ) : (
        <div
          className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 px-6 text-center"
          data-testid="artifact-image-fallback"
        >
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            {imageError ? "This image couldn't be displayed." : 'Image preview unavailable'}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {imageError
              ? 'The image failed to load. Retry the preview or download the file.'
              : 'This artifact does not contain a supported image source.'}
          </p>
        </div>
      )}
    </div>
  );

  // ============================================================================
  // PANEL VARIANT — single-toolbar, full-height flex-fill layout
  // ============================================================================
  if (variant === 'panel') {
    // Whether to show the preview content (vs source code)
    const showPreview =
      activeTab === 'preview' &&
      (canPreview || isPdf || isDocx || isSharedRendered || isImage || isMarkdownDoc);
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
          // AUDIT-FIX ART-13: `z-modal` is not a utility in this Tailwind v4 setup
          // (no --z-modal theme key), so it compiled to nothing and the fullscreen
          // overlay sat at z-index:auto - header, composer and toasts painted over
          // it. Use the repo's established form (see ui/src/primitives/Dialog.tsx).
          isFullscreen && 'fixed inset-0 z-[var(--z-modal,300)]',
          className,
        )}
      >
        {/* Single reference toolbar */}
        {/* @container: this header sizes to the ARTIFACT PANEL, not the viewport.
            The panel is a fixed-width split pane, so viewport breakpoints (sm:)
            told the labels below to render at a width the panel never has —
            a 1600px window still leaves this bar ~400px wide. The result was
            the left group overflowing its 47px box by ~198px and painting on
            top of the button row. Sizing decisions here must be container-
            relative; see the @[...] variants below. */}
        <div className="@container flex shrink-0 items-center justify-between border-b border-border/30 bg-card/80 px-3 py-1.5">
          {/* LEFT: toggle + type icon + title + type + version chip.
              overflow-hidden is load-bearing, not cosmetic: it is what
              guarantees this group can never paint over the controls on the
              right, whatever the panel width or title length. */}
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            {/* Eye/Code segmented toggle — for renderable artifacts (sandbox)
                and shared-renderer types (spreadsheet/presentation/email).
                PDF/DOCX are single-view (their "source" is an opaque data URI),
                so they get no toggle per the claude.ai artifact header. */}
            {(canPreview || isSharedRendered || isMarkdownDoc) && (
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
            {/* min-w-0 is what makes `truncate` actually engage on a flex child:
                without it the span's min-content width wins and the text pushes
                past the container instead of ellipsising. This is the element
                that absorbs the shrink — everything else here is shrink-0. */}
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {artifact.title || 'Artifact'}
            </span>
            {/* Redundant with TypeIcon and with the artifact tab above, so it is
                the first thing to go when the panel is narrow. */}
            <span className="hidden shrink-0 text-sm text-muted-foreground @[26rem]:inline">
              · {typeLabel}
            </span>
            {/* Version chip — visible from the first generated version so the
                artifact panel always answers which revision is being shown.
                Navigation remains disabled until real edit history exists. */}
            {versionCount > 0 && (
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
                {/*
                  Restore. Version browsing was read-only on web: a user could
                  page back to an earlier revision and then had no way to act on
                  it (desktop already had rollback). Restoring APPENDS the older
                  content as the new latest rather than rewinding, so the
                  intervening versions survive.
                */}
                {shownVersionIndex < versionCount - 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (restoreArtifactVersion(artifact.id, shownVersionIndex)) {
                        setViewedVersionIndex(null);
                      }
                    }}
                    className="flex h-6 items-center justify-center rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Restore version ${shownVersionIndex + 1}`}
                    title={`Restore v${shownVersionIndex + 1} as the latest version`}
                    data-testid="artifact-restore-version"
                  >
                    Restore
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: controls composed per artifact type (claude.ai parity).
              - renderable (html/react/svg/mermaid): Copy · Download · Refresh · Open · Fullscreen · Close
              - binary doc (pdf/docx): Download · Refresh · Close  (no Copy — content is an opaque data URI)
              - code / markdown doc: Copy · Download · Close
              External + Fullscreen collapse on narrow (375px) widths. */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Edit / Save · Cancel — only over the source view, and only for a
                text artifact on its latest version (see canEditSource). */}
            {canEditSource &&
              !showPreview &&
              (sourceDraft === null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSourceDraft(activeContent)}
                  className="h-7 px-2"
                  aria-label="Edit artifact source"
                  title="Edit"
                  data-testid="artifact-edit-source"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="ml-1 hidden text-xs @[30rem]:inline">Edit</span>
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveSourceEdit}
                    className="h-7 px-2"
                    aria-label="Save artifact source"
                    title="Save as a new version"
                    data-testid="artifact-save-source"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span className="ml-1 hidden text-xs @[30rem]:inline">Save</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSourceDraft(null)}
                    className="h-7 px-2"
                    aria-label="Discard artifact source edit"
                    title="Discard changes"
                    data-testid="artifact-cancel-source-edit"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="ml-1 hidden text-xs @[30rem]:inline">Cancel</span>
                  </Button>
                </>
              ))}

            {/* Copy — not for binary docs (copying a data URI is useless). */}
            {!isPdf && !isDocx && !isImage && (
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
                    <span className="ml-1 hidden text-xs @[30rem]:inline">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="ml-1 hidden text-xs @[30rem]:inline">Copy</span>
                  </>
                )}
              </Button>
            )}

            {/* Download — binary docs save real bytes via a plain button;
                everything else offers the format dropdown. */}
            {isPdf || isDocx || isImage ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={
                  isImage
                    ? () => void handleDownloadImage()
                    : generatedFileSummary.primaryUri
                      ? () => void handleDownloadGeneratedFile()
                      : handleDownloadBinaryDoc
                }
                disabled={isImage && !imageSrc}
                className="h-7 px-2"
                aria-label={isImage ? 'Download image' : 'Download file'}
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
                  {isTabular && (
                    <DropdownMenuItem onClick={handleDownloadCsv}>Download as CSV</DropdownMenuItem>
                  )}
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

            {/* Publish — only rendered when a host injected a real publisher
                (CAP-015 slice 3). No publisher, no button: offering a Publish
                action that can only copy to the clipboard is the behaviour
                AUDIT-FIX ART-27 called out. */}
            {publishArtifact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handlePublish()}
                disabled={isPublishing}
                className="h-7 px-2"
                aria-label="Publish artifact to a public link"
                title="Publish"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="ml-1 hidden text-xs @[30rem]:inline">
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </span>
              </Button>
            )}

            {/* Refresh — renderable previews and PDFs (re-mounts the frame). */}
            {(canPreview || isPdf || isImage) && (
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
                className="hidden h-7 px-2 @[22rem]:flex"
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
                className="hidden h-7 px-2 @[22rem]:flex"
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

        {/* CAP-015: the live public link for this artifact. Shown only after a
            publish actually returned a URL — never as an aspirational bar. */}
        {publishedUrl && (
          <div
            className="flex shrink-0 items-center gap-2 border-b border-border/30 bg-muted/20 px-4 py-2"
            data-testid="artifact-published-url"
          >
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <a
              href={publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-xs text-primary underline-offset-2 hover:underline"
            >
              {publishedUrl}
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                void writeToClipboard(publishedUrl).then((ok) => {
                  if (ok) toast.success('Link copied');
                  else toast.error('Could not copy the link');
                });
              }}
            >
              Copy link
            </Button>
          </div>
        )}

        {/* AUDIT-FIX ART-6: honest, per-renderer security notice (see
            securityNotice above). */}
        {securityNotice && (
          <Alert className="m-4 shrink-0 border-yellow-500 bg-yellow-50">
            <Shield className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <strong>Security Notice:</strong> {SECURITY_NOTICE_TEXT[securityNotice]}
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
                <Code className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
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

          {/* Preview: shared renderers (spreadsheet / presentation / email / chart) */}
          {showPreview && isSharedRendered && renderSharedPreview('h-full w-full')}

          {/* Preview: rendered Markdown document */}
          {showPreview && isMarkdownDoc && renderMarkdownPreview('h-full w-full')}

          {/* Preview: PDF */}
          {showPreview && isPdf && renderPdfPreview('h-full w-full')}

          {/* Preview: generated image */}
          {showPreview && isImage && renderImagePreview('h-full w-full')}

          {/* Preview: DOCX */}
          {showPreview && isDocx && (
            <>
              {docxError ? (
                <div className="flex items-center justify-center p-8 text-sm text-danger">
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
          {!showPreview &&
            (sourceDraft !== null ? (
              <textarea
                value={sourceDraft}
                onChange={(event) => setSourceDraft(event.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="h-full w-full resize-none border-0 bg-gray-900 p-4 font-mono text-sm text-gray-100 outline-none focus:ring-0"
                aria-label="Artifact source"
                data-testid="artifact-source-editor"
              />
            ) : (
              <ScrollArea className="h-full w-full bg-gray-900">
                <pre className="p-4">
                  <code className="text-sm text-gray-100">{activeContent}</code>
                </pre>
              </ScrollArea>
            ))}
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
        // AUDIT-FIX ART-13: `z-modal` compiled to nothing (no such Tailwind v4
        // utility here), leaving the fullscreen card at z-index:auto under the
        // chrome. Matches ui/src/primitives/Dialog.tsx.
        isFullscreen && 'fixed inset-0 z-[var(--z-modal,300)] rounded-none',
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
          {/*
            There is no second version control here. The card variant used to
            render a `History` dropdown over an `artifact.versions[]` side-map,
            but its only producers synthesised a one-entry list ("Initial
            version", currentVersion 0) for every artifact, so the `length > 1`
            guard could never pass and the label could only ever have said v1.
            Real edit history is the shared store's content-keyed `versionsById`,
            surfaced by the panel version chip above.
          */}
          {!isImage && (
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
          )}

          {/* Download Options */}
          {isImage ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDownloadImage()}
              disabled={!imageSrc}
              className="h-7 px-2"
              aria-label="Download image"
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
                {isTabular && (
                  <DropdownMenuItem onClick={handleDownloadCsv}>Download as CSV</DropdownMenuItem>
                )}
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

      {/* AUDIT-FIX ART-6: see securityNotice — the copy now matches the
          mitigation the renderer actually performed. */}
      {securityNotice && (
        <Alert className="m-4 border-yellow-500 bg-yellow-50">
          <Shield className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Security Notice:</strong> {SECURITY_NOTICE_TEXT[securityNotice]}
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
        {(canPreview || isPdf || isDocx || isSharedRendered || isMarkdownDoc) && (
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

        {/* Preview Tab · shared renderers (spreadsheet / presentation / email / chart) */}
        {isSharedRendered && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderSharedPreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}
          </TabsContent>
        )}

        {/* Preview Tab · rendered Markdown document */}
        {isMarkdownDoc && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderMarkdownPreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}
          </TabsContent>
        )}

        {/* Preview Tab · PDF inline viewer (Fix 39) */}
        {isPdf && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderPdfPreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[600px]')}
          </TabsContent>
        )}

        {/* Preview Tab · generated image */}
        {isImage && (
          <TabsContent value="preview" className="m-0 p-0">
            {renderImagePreview(isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[600px]')}
          </TabsContent>
        )}

        {/* Preview Tab · DOCX viewer via mammoth (Fix 40) */}
        {isDocx && (
          <TabsContent value="preview" className="m-0 p-0">
            {docxError ? (
              <div className="flex items-center justify-center p-8 text-sm text-danger">
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
