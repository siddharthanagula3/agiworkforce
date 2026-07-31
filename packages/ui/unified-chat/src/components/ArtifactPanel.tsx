import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  Globe,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Share2,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ARTIFACT_SANDBOX_ATTR, buildSandboxedHtml } from '../lib/artifact-sandbox';
import { Button } from '@agiworkforce/ui';
import type { Artifact } from '../lib/types';
import { ReactPreview } from './artifact-components/ReactPreview';
// AUDIT-FIX ART-17 / ART-18: reuse the sibling renderer's audited SVG allowlist
// and its mermaid renderer instead of re-answering the same questions here.
import { MermaidArtifact, sanitizeSvg } from './ArtifactRenderer';

/**
 * AUDIT-FIX ART-24: one guarded clipboard write for the whole panel.
 *
 * `navigator.clipboard` is undefined in an insecure context and `writeText`
 * rejects on a denied permission or an unfocused document. Every call site here
 * used to swallow that into an empty catch, so the user saw nothing at all —
 * no tick, no error, no clue. Returning the outcome lets each caller say so.
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

/**
 * AUDIT-FIX ART-25: download a Blob reliably.
 *
 * The previous inline version created an anchor, never attached it to the
 * document, clicked it, and revoked the object URL on the very next statement.
 * Firefox ignores clicks on unattached anchors, and revoking synchronously can
 * race the browser's fetch of the blob. Attach → click → detach → revoke on a
 * later tick, which is what `ArtifactRenderer.handleDownload` already did.
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Publish result contract
//
// Mirrors the discriminated union in @agiworkforce/artifacts.
// Defined inline so this panel has no hard dep on the artifacts package — the
// host injects the concrete implementation via `publishArtifact` prop (DI).
// Update both contracts if the shape changes.
// ---------------------------------------------------------------------------

/** Publish succeeded locally — file:// URL is available immediately. */
export interface ArtifactLocalPublishResult {
  kind: 'local';
  shareUrl: string;
  shareToken: string;
  publishedAt: string;
}

/**
 * Cloud publish succeeded — the artifact is reachable at a hosted URL.
 *
 * AUDIT-FIX ART-27: mirrors `CloudPublishResult` in @agiworkforce/artifacts.
 */
export interface ArtifactCloudPublishResult {
  kind: 'cloud';
  shareUrl: string;
  publishedAt: string;
}

/**
 * Cloud publish could not run because this host injected no cloud publisher.
 *
 * AUDIT-FIX ART-27: mirrors `CloudUnavailablePublishResult` in
 * @agiworkforce/artifacts. This is a capability statement about the host, NOT
 * a launch gate — managed cloud has been open by default since the founder
 * decision of 2026-06-27.
 */
export interface ArtifactCloudUnavailablePublishResult {
  kind: 'unavailable';
  shareUrl: null;
  reason: string;
}

/** Discriminated union of possible publish outcomes. */
export type ArtifactPublishResult =
  | ArtifactLocalPublishResult
  | ArtifactCloudPublishResult
  | ArtifactCloudUnavailablePublishResult;

export interface ArtifactPanelProps {
  artifact: Artifact | null;
  viewMode: 'preview' | 'code';
  onViewModeChange: (mode: 'preview' | 'code') => void;
  onClose: () => void;
  /**
   * Optional version history for the current artifact. When provided with
   * more than one entry, the header renders a prev/next stepper so the user
   * can navigate edits. Round-2 audit P0 #9 (Artifacts versioning,
   * 2026-05-21). Host apps build this from the artifactStore by grouping
   * artifacts that share a `title` (or a stable group id) per conversation.
   */
  versions?: Artifact[];
  /** Called when the user picks a different version from the stepper. */
  onSelectVersion?: (artifact: Artifact) => void;
  /**
   * Optional edit-in-place callback. When supplied, the toolbar shows an
   * Edit button alongside the existing Code/Preview toggles. The host is
   * responsible for either mutating the existing artifact in-place or
   * persisting a new version — the panel only forwards the edited content.
   * Round-2 audit P0 #9 (Artifacts edit-in-place, 2026-05-21 final quadrant).
   */
  onSaveEdit?: (artifactId: string, content: string) => void | Promise<void>;
  /**
   * Optional publish callback. Injected by the host (e.g. Desktop adapter
   * using @agiworkforce/artifacts publishArtifact). When omitted the panel
   * falls back to the clipboard markdown snapshot.
   *
   * R20 lane 2: artifact-publish service wiring. Versioning + inline editor
   * deferred (TODO: EXEC-SUMMARY-r2 hours).
   */
  publishArtifact?: () => Promise<ArtifactPublishResult>;
}

function getTypeLabel(artifact: Artifact): string {
  switch (artifact.type) {
    case 'html':
      return 'HTML';
    case 'react':
      return 'React';
    case 'markdown':
      return 'Markdown';
    case 'json':
      return 'JSON';
    case 'code':
      return artifact.language?.toUpperCase() ?? 'Code';
    case 'document':
      return 'Document';
    case 'research':
      return 'Research';
    case 'svg':
      return 'SVG';
    case 'mermaid':
      return 'Mermaid';
    case 'image':
      return 'Image';
    default:
      return 'Artifact';
  }
}

function getTypeCategory(artifact: Artifact): string {
  switch (artifact.type) {
    case 'html':
    case 'react':
    case 'code':
    case 'svg':
    case 'mermaid':
    case 'json':
      return 'Code';
    case 'document':
    case 'markdown':
      return 'Document';
    case 'research':
      return 'Research';
    default:
      return 'Artifact';
  }
}

/**
 * AUDIT-FIX ART-28: how many lines CodeView will mount at once.
 *
 * CodeView is the fallback body for every non-previewable artifact type, and it
 * emitted one `<tr>` with two `<td>`s per line unconditionally — a 20k-line
 * artifact meant ~60k DOM nodes built synchronously the moment the panel
 * opened. The window keeps the first chunk instant and lets the user pull in
 * more explicitly; the Copy button always copies the FULL content, so nothing
 * is hidden from the clipboard or from Download.
 */
const CODE_VIEW_LINE_WINDOW = 1000;

function CodeView({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  // AUDIT-FIX ART-24: a failed clipboard write is shown, not swallowed.
  const [copyFailed, setCopyFailed] = useState(false);

  const lines = useMemo(() => content.split('\n'), [content]);
  // AUDIT-FIX ART-28: grows by one window per "Show more" click.
  const [visibleLines, setVisibleLines] = useState(CODE_VIEW_LINE_WINDOW);

  // Reset the window when the artifact body changes, so switching from a huge
  // artifact to a small one does not leave an expanded window behind.
  useEffect(() => {
    setVisibleLines(CODE_VIEW_LINE_WINDOW);
  }, [content]);

  const shownLines = lines.length > visibleLines ? lines.slice(0, visibleLines) : lines;
  const hiddenLineCount = lines.length - shownLines.length;

  async function handleCopy() {
    // Always copies the whole artifact, never just the visible window.
    if (await writeToClipboard(content)) {
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return;
    }
    setCopyFailed(true);
    setTimeout(() => setCopyFailed(false), 2500);
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={copyFailed ? 'Copy failed' : copied ? 'Copied' : 'Copy code'}
        onClick={handleCopy}
        className={cn(
          'absolute top-2 right-2 z-10 h-7 w-7',
          'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
          copied && 'text-[var(--chat-accent-secondary)]',
          copyFailed && 'text-red-400',
        )}
      >
        <Copy size={13} />
      </Button>

      {copyFailed && (
        <div
          role="status"
          className="absolute top-10 right-2 z-10 rounded border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-2 py-1 text-[11px] text-red-400"
        >
          Copy failed — clipboard unavailable
        </div>
      )}

      <div className="h-full overflow-auto bg-[var(--chat-surface-overlay)]">
        <table className="w-full border-collapse">
          <tbody>
            {shownLines.map((line, index) => (
              <tr key={index} className="hover:bg-[var(--chat-surface-hover)]/40">
                <td
                  className="select-none pr-4 pl-4 text-right text-[13px] font-mono text-[var(--chat-text-muted)] w-12 min-w-12"
                  aria-hidden
                >
                  {index + 1}
                </td>
                <td className="pr-4 text-[13px] font-mono text-[var(--chat-text-primary)] whitespace-pre leading-relaxed">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {hiddenLineCount > 0 && (
          <div className="flex items-center gap-3 border-t border-[var(--chat-border)] px-4 py-2">
            <span className="text-[11px] text-[var(--chat-text-muted)]">
              {hiddenLineCount.toLocaleString()} more {hiddenLineCount === 1 ? 'line' : 'lines'} not
              shown
            </span>
            <button
              type="button"
              onClick={() => setVisibleLines((n) => n + CODE_VIEW_LINE_WINDOW)}
              className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
            >
              Show {Math.min(hiddenLineCount, CODE_VIEW_LINE_WINDOW).toLocaleString()} more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DropdownMenu({
  onDownload,
  onPublish,
}: {
  onDownload: () => void;
  onPublish: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="More options"
        onClick={() => setOpen((prev) => !prev)}
        className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
      >
        <ChevronDown size={14} />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={cn(
              'absolute right-0 top-full mt-1 z-20 min-w-[140px]',
              'rounded-[var(--chat-radius-md)] border border-[var(--chat-border)]',
              'bg-[var(--chat-surface-elevated)] shadow-lg',
              'py-1',
            )}
          >
            <button
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm',
                'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                'transition-colors',
              )}
              onClick={() => {
                onDownload();
                setOpen(false);
              }}
            >
              <Download size={13} />
              Download
            </button>
            <button
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm',
                'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                'transition-colors',
              )}
              onClick={() => {
                onPublish();
                setOpen(false);
              }}
            >
              <Globe size={13} />
              Publish
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ArtifactPanel({
  artifact,
  viewMode,
  onViewModeChange,
  onClose,
  versions,
  onSelectVersion,
  onSaveEdit,
  publishArtifact: publishArtifactProp,
}: ArtifactPanelProps) {
  const [headerCopied, setHeaderCopied] = useState(false);
  // Run/Stop control for HTML preview. Defaults to running; pausing strips
  // the iframe and re-mounts on resume. The toggle only appears when the
  // current artifact is HTML — React previews own their own reload UX, and
  // layout-only artifact types (markdown, document, svg, image) never run
  // scripts so a pause control would be misleading.
  const [htmlPreviewRunning, setHtmlPreviewRunning] = useState(true);
  // Edit-in-place state. `isEditing` toggles between CodeView and an
  // editable textarea. `editDraft` holds the working copy; the source of
  // truth remains the supplied artifact until Save fires onSaveEdit. We
  // also auto-exit edit mode when the active artifact changes so the user
  // doesn't accidentally save text from another artifact's body.
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // Publish state — tracks in-flight publish and the last result so the
  // panel can show the share URL or honest host-unavailable state without a sonner dep.
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<ArtifactPublishResult | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Ref for the share-URL copy button feedback (avoids extra useState).
  const shareUrlCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  // AUDIT-FIX ART-24: last clipboard failure, rendered in the notification bar.
  const [copyError, setCopyError] = useState<string | null>(null);
  // AUDIT-FIX ART-15: bumped by the toolbar Retry button to force a fresh
  // preview mount (new iframe / new ReactPreview instance).
  const [previewNonce, setPreviewNonce] = useState(0);

  useEffect(() => {
    setIsEditing(false);
    setEditDraft('');
    setIsSavingEdit(false);
    // Reset publish state when the artifact changes so stale results don't
    // show for the wrong artifact.
    setPublishResult(null);
    setPublishError(null);
    setShareUrlCopied(false);
    // AUDIT-FIX ART-24: a copy failure belongs to the artifact it happened on.
    setCopyError(null);
  }, [artifact?.id]);

  // Cleanup share-URL copy timer on unmount.
  useEffect(() => {
    return () => {
      if (shareUrlCopiedTimerRef.current) clearTimeout(shareUrlCopiedTimerRef.current);
    };
  }, []);

  // The host supplies versions ordered oldest-first; the stepper trusts
  // that ordering and maps array indices to "v1 / v2 / ..." labels. When
  // the host omits versions or supplies only one entry, the stepper hides.
  const sortedVersions = useMemo<Artifact[]>(() => {
    if (!versions || versions.length === 0) return [];
    return versions;
  }, [versions]);

  const currentVersionIndex = useMemo(() => {
    if (!artifact || sortedVersions.length === 0) return -1;
    return sortedVersions.findIndex((v) => v.id === artifact.id);
  }, [artifact, sortedVersions]);

  const hasPreviousVersion = currentVersionIndex > 0;
  const hasNextVersion =
    currentVersionIndex >= 0 && currentVersionIndex < sortedVersions.length - 1;

  function goToVersion(index: number): void {
    if (index < 0 || index >= sortedVersions.length) return;
    const next = sortedVersions[index];
    if (next) onSelectVersion?.(next);
  }

  async function handleCopyContent() {
    if (!artifact) return;
    // AUDIT-FIX ART-24: report the failure instead of leaving the button inert.
    if (await writeToClipboard(artifact.content)) {
      setCopyError(null);
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 1500);
      return;
    }
    setCopyError('Could not copy to the clipboard.');
  }

  function enterEditMode() {
    if (!artifact) return;
    setEditDraft(artifact.content);
    setIsEditing(true);
  }

  function discardEdit() {
    setIsEditing(false);
    setEditDraft('');
  }

  async function saveEdit() {
    if (!artifact || !onSaveEdit) return;
    setIsSavingEdit(true);
    try {
      await onSaveEdit(artifact.id, editDraft);
      setIsEditing(false);
      setEditDraft('');
    } finally {
      setIsSavingEdit(false);
    }
  }

  function handleDownload() {
    if (!artifact) return;
    const ext =
      artifact.type === 'html'
        ? 'html'
        : artifact.type === 'react'
          ? 'tsx'
          : artifact.type === 'markdown'
            ? 'md'
            : artifact.type === 'json'
              ? 'json'
              : artifact.type === 'svg'
                ? 'svg'
                : artifact.type === 'document'
                  ? 'md'
                  : (artifact.language ?? 'txt');
    // AUDIT-FIX ART-25: see downloadBlob — attach/click/detach/late-revoke.
    downloadBlob(
      new Blob([artifact.content], { type: 'text/plain' }),
      `${(artifact.title ?? 'artifact').replace(/\s+/g, '-').toLowerCase()}.${ext}`,
    );
  }

  const handlePublish = useCallback(async () => {
    if (!artifact) return;
    setPublishError(null);

    // --- Service path: host injected publishArtifact ---
    if (publishArtifactProp) {
      setIsPublishing(true);
      try {
        const result = await publishArtifactProp();
        setPublishResult(result);
      } catch (err) {
        setPublishError(err instanceof Error ? err.message : 'Failed to publish artifact');
      } finally {
        setIsPublishing(false);
      }
      return;
    }

    // --- Fallback: clipboard markdown snapshot (no host adapter) ---
    // Round-2 audit P0 #9 (2026-05-21). Cloud-side artifact publishing
    // arrives with Cloud Managed; until then "Publish" copies a portable
    // self-contained snapshot to the clipboard so the user can paste it
    // into a doc, chat thread, or GitHub gist as a fallback.
    const snapshot = [
      `# ${artifact.title ?? 'Untitled artifact'}`,
      `Type: ${getTypeLabel(artifact)}${artifact.language ? ` (${artifact.language})` : ''}`,
      '',
      '```' + (artifact.language ?? ''),
      artifact.content,
      '```',
    ].join('\n');
    // AUDIT-FIX ART-24: explicit success/failure instead of a bare try/catch.
    if (await writeToClipboard(snapshot)) {
      // Reuse the existing copied-state feedback channel so the toolbar
      // briefly shows the check.
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 1500);
      return;
    }
    // Clipboard unavailable (insecure context, denied permission) — fall back
    // to a download so the user still gets the bytes.
    // AUDIT-FIX ART-25: reliable anchor lifecycle, see downloadBlob.
    downloadBlob(
      new Blob([snapshot], { type: 'text/markdown' }),
      `${(artifact.title ?? 'artifact').replace(/\s+/g, '-').toLowerCase()}-snapshot.md`,
    );
  }, [artifact, publishArtifactProp]);

  const handleCopyShareUrl = useCallback(async () => {
    // AUDIT-FIX ART-27: 'cloud' results carry a share URL too.
    if (!publishResult) return;
    if (publishResult.kind !== 'local' && publishResult.kind !== 'cloud') return;
    // AUDIT-FIX ART-24: surface the failure rather than dropping it.
    if (await writeToClipboard(publishResult.shareUrl)) {
      setCopyError(null);
      setShareUrlCopied(true);
      if (shareUrlCopiedTimerRef.current) clearTimeout(shareUrlCopiedTimerRef.current);
      shareUrlCopiedTimerRef.current = setTimeout(() => setShareUrlCopied(false), 2000);
      return;
    }
    setCopyError('Could not copy the share URL to the clipboard.');
  }, [publishResult]);

  /**
   * AUDIT-FIX ART-15: the toolbar Retry button had an aria-label, a disabled
   * guard, hover styling — and no onClick at all. It has been a decorative
   * no-op for every user who ever pressed it. It now re-mounts the live
   * preview (fresh iframe / fresh ReactPreview) and clears the transient
   * failures the panel is showing, which is the only "retry" this component
   * owns; artifact content itself is the host's to re-fetch.
   */
  const handleRetryPreview = useCallback(() => {
    if (!artifact) return;
    setPublishError(null);
    setCopyError(null);
    setHtmlPreviewRunning(true);
    setPreviewNonce((n) => n + 1);
  }, [artifact]);

  /**
   * AUDIT-FIX ART-18: `mermaid` is now previewable here.
   *
   * `getTypeLabel` happily labelled mermaid / json / code / research, so those
   * artifacts got a type badge next to a Preview toggle that was permanently
   * disabled at opacity-40 — a control that exists, is described, and can never
   * do anything. Meanwhile the sibling `ArtifactRenderer` in this very package
   * rendered mermaid diagrams fine. The two now agree: mermaid renders through
   * the same `MermaidArtifact`, and for the genuinely non-previewable types
   * (json / code / research) the Preview toggle is not rendered at all rather
   * than rendered dead.
   */
  const canPreview =
    artifact?.type === 'html' ||
    artifact?.type === 'react' ||
    artifact?.type === 'svg' ||
    artifact?.type === 'mermaid' ||
    artifact?.type === 'markdown' ||
    artifact?.type === 'document' ||
    artifact?.type === 'image';

  /**
   * AUDIT-FIX ART-17: SVG previews are sanitized here with the same allowlist
   * the sibling `ArtifactRenderer.SvgArtifact` uses, and encoded with
   * `encodeURIComponent` instead of `btoa`.
   *
   * `btoa(artifact.content)` ran inline during render with no try/catch and
   * throws `InvalidCharacterError` on any code point above U+00FF — a CJK
   * label, a Cyrillic caption, an em-dash or an emoji inside the SVG took down
   * the whole panel subtree with no error boundary in sight. A percent-encoded
   * `utf8` data URL has no such limit and needs no base64 step.
   */
  const svgPreview = useMemo<{ src: string; error: string | null }>(() => {
    if (!artifact || artifact.type !== 'svg') return { src: '', error: null };
    const sanitized = sanitizeSvg(artifact.content);
    if (!sanitized) {
      return { src: '', error: 'This SVG could not be parsed, or it is not valid SVG markup.' };
    }
    return {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(sanitized)}`,
      error: null,
    };
  }, [artifact]);

  /**
   * Pre-build the sandboxed HTML once per artifact swap. Empty when paused.
   *
   * AUDIT-FIX ART-16: a `buildSandboxedHtml` throw used to be swallowed into
   * `''`, and the body branch was `htmlPreviewRunning && srcDoc ? iframe :
   * <Run preview>` — so a BUILD FAILURE rendered an inert "Run preview" button,
   * i.e. the panel presented its own failure as a pause the user had chosen.
   * Clicking it did nothing because the state was already `running`. Failure
   * and paused are now distinct states.
   */
  const htmlPreview = useMemo<{ srcDoc: string; error: string | null }>(() => {
    if (!artifact || artifact.type !== 'html') return { srcDoc: '', error: null };
    if (!htmlPreviewRunning) return { srcDoc: '', error: null };
    try {
      return { srcDoc: buildSandboxedHtml(artifact.content), error: null };
    } catch (err) {
      return {
        srcDoc: '',
        error: err instanceof Error ? err.message : 'Could not prepare this HTML for preview.',
      };
    }
  }, [artifact, htmlPreviewRunning]);

  return (
    <div className="flex h-full flex-col bg-[var(--chat-surface-base)]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--chat-border)] px-3">
        {/* Left: view mode toggles */}
        <div className="flex items-center gap-0.5">
          {/* AUDIT-FIX ART-18: rendered only when it can actually do something.
              A permanently-disabled toggle at opacity-40 is a dead control that
              still advertises a capability the panel does not have. */}
          {canPreview && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Preview mode"
              onClick={() => onViewModeChange('preview')}
              className={cn(
                'h-7 w-7',
                viewMode === 'preview'
                  ? 'text-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/10'
                  : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              )}
            >
              <Eye size={14} />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            aria-label="Code mode"
            onClick={() => onViewModeChange('code')}
            className={cn(
              'h-7 w-7',
              viewMode === 'code'
                ? 'text-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/10'
                : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
            )}
          >
            <Code2 size={14} />
          </Button>
        </div>

        <div className="h-4 w-px bg-[var(--chat-border)]" />

        {/* Center: title + type */}
        <div className="flex flex-1 items-center gap-1.5 min-w-0 overflow-hidden">
          {artifact ? (
            <span className="truncate text-sm font-medium text-[var(--chat-text-secondary)]">
              {artifact.title ?? 'Untitled artifact'}
              <span className="text-[var(--chat-text-muted)] font-normal"> · </span>
              <span className="text-[var(--chat-text-muted)] font-normal">
                {getTypeCategory(artifact)} · {getTypeLabel(artifact)}
              </span>
            </span>
          ) : (
            <span className="text-sm text-[var(--chat-text-muted)]">No artifact</span>
          )}
        </div>

        {/* Version stepper — only when host supplies a version history */}
        {sortedVersions.length > 1 && artifact ? (
          <div
            className="flex items-center gap-0.5 shrink-0 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-1"
            aria-label="Artifact version stepper"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous version"
              disabled={!hasPreviousVersion}
              onClick={() => goToVersion(currentVersionIndex - 1)}
              className={cn(
                'h-6 w-6',
                hasPreviousVersion
                  ? 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]'
                  : 'text-[var(--chat-text-muted)] opacity-40 cursor-not-allowed',
              )}
            >
              <ChevronLeft size={13} />
            </Button>
            <span className="px-1 text-[11px] font-mono tabular-nums text-[var(--chat-text-secondary)]">
              v{currentVersionIndex + 1}/{sortedVersions.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next version"
              disabled={!hasNextVersion}
              onClick={() => goToVersion(currentVersionIndex + 1)}
              className={cn(
                'h-6 w-6',
                hasNextVersion
                  ? 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]'
                  : 'text-[var(--chat-text-muted)] opacity-40 cursor-not-allowed',
              )}
            >
              <ChevronRight size={13} />
            </Button>
          </div>
        ) : null}

        {/* Right: actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label={headerCopied ? 'Copied' : 'Copy content'}
            onClick={handleCopyContent}
            disabled={!artifact}
            className={cn(
              'h-7 w-7',
              'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              headerCopied && 'text-[var(--chat-accent-secondary)]',
            )}
          >
            <Copy size={13} />
          </Button>

          <DropdownMenu onDownload={handleDownload} onPublish={handlePublish} />

          {onSaveEdit && !isEditing ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit artifact"
              disabled={!artifact}
              onClick={enterEditMode}
              className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
            >
              <Pencil size={13} />
            </Button>
          ) : null}
          {onSaveEdit && isEditing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Save edit"
                disabled={!artifact || isSavingEdit}
                onClick={saveEdit}
                className="h-7 w-7 text-[var(--chat-accent-secondary)] hover:bg-[var(--chat-surface-hover)]"
              >
                <Check size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Discard edit"
                disabled={!artifact || isSavingEdit}
                onClick={discardEdit}
                className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
              >
                <X size={14} />
              </Button>
            </>
          ) : null}

          {/* AUDIT-FIX ART-15: wired (was a decorative no-op). Only offered
              where there is a live preview to re-mount. */}
          {canPreview && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Retry preview"
              title="Reload the preview"
              disabled={!artifact}
              onClick={handleRetryPreview}
              className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
            >
              <RotateCcw size={13} />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            aria-label="Close panel"
            onClick={onClose}
            className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {!artifact ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--chat-text-muted)]">
            No artifact selected
          </div>
        ) : isEditing ? (
          // Edit-in-place: show a plain textarea bound to the draft buffer.
          // We deliberately keep the editor minimal — host apps that want a
          // real code editor (Monaco, CodeMirror) can swap onSaveEdit for
          // their own modal flow. Round-2 audit P0 #9 final quadrant.
          <div className="flex h-full flex-col" data-testid="artifact-panel-edit-mode">
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              spellCheck={false}
              className="h-full w-full resize-none bg-[var(--chat-surface-overlay)] px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--chat-text-primary)] outline-none"
              aria-label="Edit artifact content"
            />
          </div>
        ) : viewMode === 'preview' && artifact.type === 'svg' ? (
          // SVG: render as <img> to prevent script execution — no allow-scripts.
          // AUDIT-FIX ART-17: sanitized + percent-encoded (see svgPreview).
          <div className="flex h-full items-center justify-center overflow-auto p-4 bg-white">
            {svgPreview.error ? (
              <p
                className="max-w-sm text-center text-sm text-[var(--chat-text-muted)]"
                data-testid="artifact-panel-svg-error"
              >
                {svgPreview.error}
              </p>
            ) : (
              <img
                key={previewNonce}
                src={svgPreview.src}
                alt={artifact.title ?? 'Artifact preview'}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        ) : viewMode === 'preview' && artifact.type === 'mermaid' ? (
          // AUDIT-FIX ART-18: mermaid renders through the same component the
          // sibling ArtifactRenderer uses, instead of falling through to raw
          // source behind a disabled Preview toggle. `isDark` is fixed to true
          // because this panel's surface tokens (`--chat-surface-*`) are the
          // dark chat shell; the panel takes no theme prop to thread through.
          <div className="h-full overflow-auto p-4" data-testid="artifact-panel-mermaid-preview">
            <MermaidArtifact key={previewNonce} artifact={artifact} isDark />
          </div>
        ) : viewMode === 'preview' && artifact.type === 'image' ? (
          <div className="flex h-full items-center justify-center overflow-auto bg-[var(--chat-surface-overlay)] p-4">
            <img
              src={artifact.content}
              alt={artifact.title ?? 'Artifact image'}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        ) : viewMode === 'preview' &&
          (artifact.type === 'markdown' || artifact.type === 'document') ? (
          <div className="h-full overflow-auto bg-[var(--chat-surface-overlay)] px-5 py-4">
            <article className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--chat-text-primary)]">
              {artifact.content}
            </article>
          </div>
        ) : viewMode === 'preview' && artifact.type === 'react' ? (
          // React: delegate to the in-package ReactPreview, which spins up a
          // sandboxed iframe with Babel + React from CDN and posts back ready/
          // error events. Round-2 audit P0 #9 live React preview.
          // AUDIT-FIX ART-15: `previewNonce` re-mounts it when Retry is pressed.
          <ReactPreview key={previewNonce} code={artifact.content} className="h-full" />
        ) : viewMode === 'preview' && artifact.type === 'html' ? (
          // HTML: sandboxed iframe with CSP meta injection + Run/Stop control.
          // Uses the shared `buildSandboxedHtml` so the security envelope cannot
          // drift between ArtifactPanel and ArtifactRenderer.HtmlArtifact.
          <div className="flex h-full flex-col" data-testid="artifact-panel-html-preview">
            <div className="flex items-center gap-2 border-b border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-3 py-1.5">
              <Globe size={12} className="text-[var(--chat-text-muted)]" />
              <span className="text-[11px] text-[var(--chat-text-muted)]">HTML preview</span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                aria-label={htmlPreviewRunning ? 'Stop preview' : 'Run preview'}
                onClick={() => setHtmlPreviewRunning((prev) => !prev)}
                className="h-6 w-6 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
              >
                {htmlPreviewRunning ? <Pause size={12} /> : <Play size={12} />}
              </Button>
            </div>
            {/* AUDIT-FIX ART-16: three distinct states — build failure, running,
                paused — instead of collapsing the first into the third. */}
            {htmlPreview.error ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
                data-testid="artifact-panel-html-error"
              >
                <span className="text-sm text-[var(--chat-text-primary)]">
                  This HTML couldn&apos;t be prepared for preview.
                </span>
                <span className="max-w-sm text-xs text-[var(--chat-text-muted)]">
                  {htmlPreview.error}
                </span>
                <button
                  type="button"
                  onClick={() => onViewModeChange('code')}
                  className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
                >
                  View source
                </button>
              </div>
            ) : htmlPreviewRunning ? (
              <iframe
                key={previewNonce}
                srcDoc={htmlPreview.srcDoc}
                sandbox={ARTIFACT_SANDBOX_ATTR}
                referrerPolicy="no-referrer"
                className="flex-1 w-full border-0 bg-white"
                title={artifact.title ?? 'Artifact preview'}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--chat-text-muted)]">
                <button
                  type="button"
                  onClick={() => setHtmlPreviewRunning(true)}
                  className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] transition-colors"
                >
                  Run preview
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'preview' && canPreview ? (
          // Fallback for any future preview-able artifact types not handled
          // above. Layout-only sandbox: no scripts, no modals, no forms.
          <iframe
            srcDoc={artifact.content}
            sandbox=""
            className="h-full w-full border-0 bg-white"
            title={artifact.title ?? 'Artifact preview'}
          />
        ) : (
          <CodeView content={artifact.content} />
        )}
      </div>

      {/* Publish / clipboard notification bar — shown after an action resolves */}
      {(isPublishing || publishResult || publishError || copyError) && (
        <div
          className={cn(
            'shrink-0 border-t border-[var(--chat-border)] px-3 py-2',
            'bg-[var(--chat-surface-overlay)] text-xs',
            'flex items-center gap-2',
          )}
          data-testid="artifact-publish-bar"
        >
          {isPublishing && <span className="text-[var(--chat-text-muted)]">Publishing…</span>}

          {/* AUDIT-FIX ART-27: 'local' and 'cloud' both produce a real URL. */}
          {!isPublishing &&
            (publishResult?.kind === 'local' || publishResult?.kind === 'cloud') && (
              <>
                <Share2 size={11} className="shrink-0 text-[var(--chat-accent-secondary)]" />
                <span className="min-w-0 truncate text-[var(--chat-text-secondary)]">
                  {publishResult.shareUrl}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={shareUrlCopied ? 'Copied' : 'Copy share URL'}
                  onClick={() => void handleCopyShareUrl()}
                  className={cn(
                    'ml-auto h-6 w-6 shrink-0',
                    'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
                    shareUrlCopied && 'text-[var(--chat-accent-secondary)]',
                  )}
                >
                  {shareUrlCopied ? <Check size={11} /> : <Copy size={11} />}
                </Button>
              </>
            )}

          {/* AUDIT-FIX ART-27: no waitlist, no sign-up link.
              Managed cloud has been open by default since the founder decision
              of 2026-06-27; `AGI_MANAGED_COMPUTE_PRIVATE_BETA` survives only as
              an incident kill-switch and was never what gated this bar. What is
              actually true when we land here is narrower and duller: THIS host
              injected no cloud publisher, so there is nothing to publish to.
              Say that, and say what the user can do instead — Download works. */}
          {!isPublishing && publishResult?.kind === 'unavailable' && (
            <>
              <Globe size={11} className="shrink-0 text-[var(--chat-text-muted)]" />
              <span className="text-[var(--chat-text-secondary)]">{publishResult.reason}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="ml-auto h-6 shrink-0 px-2 text-[11px] text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
              >
                Download instead
              </Button>
            </>
          )}

          {!isPublishing && publishError && (
            <>
              <span className="text-red-400">{publishError}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss error"
                onClick={() => setPublishError(null)}
                className="ml-auto h-6 w-6 shrink-0 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)]"
              >
                <X size={11} />
              </Button>
            </>
          )}

          {/* AUDIT-FIX ART-24: clipboard failures were swallowed by three empty
              catch blocks; the user pressed Copy and nothing at all happened. */}
          {!isPublishing && !publishError && copyError && (
            <>
              <span className="text-red-400" role="status">
                {copyError}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss copy error"
                onClick={() => setCopyError(null)}
                className="ml-auto h-6 w-6 shrink-0 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)]"
              >
                <X size={11} />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
