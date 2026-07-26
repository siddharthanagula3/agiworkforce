'use client';

import { useCallback } from 'react';
import { useMounted } from '@shared/hooks/useMounted';
import {
  FileCode,
  Code2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Globe,
  ChevronRight,
  Mail,
  Presentation,
  Shield,
  FolderDown,
} from 'lucide-react';
import { summarizeGeneratedFileBundle } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { buildSandboxSrcDoc } from '@shared/utils/html-sanitizer';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { downloadAllArtifacts } from '../../utils/downloadArtifacts';
import type { ArtifactData } from './ArtifactPreview';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InlineArtifactCardsProps {
  artifacts: ArtifactData[];
  /** Called when user clicks a card or the overflow card · opens the panel. */
  onOpen?: (artifactId: string) => void;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map artifact type to a human-readable badge label. */
function typeBadge(type: ArtifactData['type']): string {
  switch (type) {
    case 'html':
      return 'HTML';
    case 'react':
      return 'React';
    case 'svg':
      return 'SVG';
    case 'mermaid':
      return 'Diagram';
    case 'code':
      return 'Code';
    case 'document':
      return 'Document';
    case 'spreadsheet':
    case 'csv':
      return 'Spreadsheet';
    case 'table':
      return 'Table';
    case 'presentation':
      return 'Slides';
    case 'email':
      return 'Email';
    case 'image':
      return 'Image';
    default:
      return 'File';
  }
}

/** Category word for the Claude-style "{Kind} · {EXT}" subtitle (e.g. "Code", "Document"). */
function kindLabel(type: ArtifactData['type']): string {
  switch (type) {
    case 'html':
    case 'react':
    case 'svg':
    case 'mermaid':
    case 'code':
      return 'Code';
    case 'spreadsheet':
    case 'csv':
    case 'table':
      return 'Spreadsheet';
    case 'presentation':
      return 'Slides';
    case 'email':
      return 'Email';
    case 'image':
      return 'Image';
    case 'document':
    default:
      return 'Document';
  }
}

/** Short uppercase extension for the subtitle (e.g. MD, HTML, PY). */
function extLabel(artifact: ArtifactData): string {
  const raw = (artifact.language || artifact.type || '').toLowerCase();
  const map: Record<string, string> = {
    markdown: 'MD',
    md: 'MD',
    javascript: 'JS',
    typescript: 'TS',
    python: 'PY',
    html: 'HTML',
    svg: 'SVG',
    csv: 'CSV',
    json: 'JSON',
    document: 'DOC',
  };
  return (map[raw] || raw || 'file').toUpperCase().slice(0, 6);
}

/** Icon for each artifact type. Exported for reuse in the artifact viewer header. */
export function TypeIcon({ type, className }: { type: ArtifactData['type']; className?: string }) {
  const cls = cn('shrink-0', className);
  switch (type) {
    case 'html':
      return <Globe className={cls} aria-hidden="true" />;
    case 'react':
      return <Code2 className={cls} aria-hidden="true" />;
    case 'svg':
    case 'image':
      return <ImageIcon className={cls} aria-hidden="true" />;
    case 'mermaid':
      return <FileCode className={cls} aria-hidden="true" />;
    case 'spreadsheet':
    case 'table':
    case 'csv':
      return <FileSpreadsheet className={cls} aria-hidden="true" />;
    case 'presentation':
      return <Presentation className={cls} aria-hidden="true" />;
    case 'email':
      return <Mail className={cls} aria-hidden="true" />;
    default:
      return <FileText className={cls} aria-hidden="true" />;
  }
}

/** Badge color per artifact type. */
function badgeClass(type: ArtifactData['type']): string {
  switch (type) {
    case 'html':
      return 'bg-orange-500/15 text-orange-400';
    case 'react':
      return 'bg-sky-500/15 text-sky-400';
    case 'svg':
      return 'bg-violet-500/15 text-violet-400';
    case 'image':
      return 'bg-fuchsia-500/15 text-fuchsia-400';
    case 'mermaid':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'code':
      return 'bg-amber-500/15 text-amber-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// ─── Single Full-Width Card (Fix 44) ─────────────────────────────────────────

function ArtifactFullCard({ artifact, onClick }: { artifact: ArtifactData; onClick: () => void }) {
  // The sandboxed thumbnail iframe is client-only: buildSandboxSrcDoc runs DOMPurify,
  // which needs a real DOM. Gate on mount so the server renders an inert placeholder
  // and the real srcDoc is applied by a post-mount re-render (no SSR crash, no blank
  // iframe from hydration not re-syncing the attribute). See useMounted.
  const mounted = useMounted();
  const canRender = mounted && ['html', 'react', 'svg', 'mermaid'].includes(artifact.type);
  const generatedFileSummary = summarizeGeneratedFileBundle({
    computeSession: artifact.computeSession,
    generatedFile: artifact.generatedFile,
    artifactManifest: artifact.artifactManifest,
    fallbackFileName: artifact.title,
    fallbackKind: artifact.generatedFile?.kind ?? artifact.language ?? artifact.type,
    fallbackMimeType: artifact.generatedFile?.mimeType,
    fallbackUri: artifact.generatedFile?.uri,
    fallbackStatus: artifact.computeSession?.status,
  });
  const hasGeneratedFileManifest = Boolean(
    artifact.computeSession || artifact.generatedFile || artifact.artifactManifest,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full flex items-stretch overflow-hidden rounded-xl border border-border/40',
        'bg-muted/30 hover:bg-muted/50 transition-colors text-left',
      )}
      aria-label={`Open artifact: ${artifact.title || 'Untitled'}`}
    >
      {/* Preview area · 80px wide on the left */}
      <div className="relative w-20 shrink-0 overflow-hidden bg-muted/60 border-r border-border/30">
        {canRender ? (
          <iframe
            title={artifact.title || 'Artifact preview'}
            sandbox="allow-scripts"
            srcDoc={(() => {
              // For html artifacts: use buildSandboxSrcDoc so the thumbnail
              // preview is a correctly structured single document (no double-
              // wrap). The iframe has sandbox="allow-scripts" (NO
              // allow-same-origin), so the null-origin sandbox is the boundary.
              // For other types: inject raw content into a minimal shell (they
              // don't contain scripts that need execution in the thumbnail).
              if (artifact.type === 'html') {
                return buildSandboxSrcDoc(artifact.content.slice(0, 800));
              }
              const preview = artifact.content.slice(0, 800);
              return `<html><head><meta charset="UTF-8"><style>body{margin:0;padding:4px;font-size:7px;overflow:hidden;background:#fff}*{max-width:100%}</style></head><body>${preview}</body></html>`;
            })()}
            className="pointer-events-none h-full w-full"
            style={{
              width: '250%',
              height: '250%',
              transform: 'scale(0.4)',
              transformOrigin: 'top left',
            }}
            aria-hidden="true"
          />
        ) : (
          <div className="flex h-full w-full min-h-[64px] items-center justify-center">
            <TypeIcon type={artifact.type} className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
        {/* Hover open indicator */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
          <ChevronRight
            className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Text area · fills remaining width */}
      <div className="flex flex-1 min-w-0 flex-col justify-center gap-1 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-1 truncate text-sm font-medium text-foreground leading-tight">
            {artifact.title || 'Untitled'}
          </span>
          <span
            className={cn(
              'shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide',
              badgeClass(artifact.type),
            )}
          >
            {typeBadge(artifact.type)}
          </span>
        </div>

        {hasGeneratedFileManifest && generatedFileSummary.privacyShortLabel && (
          <span className="inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight text-muted-foreground">
            <Shield className="h-2.5 w-2.5" aria-hidden="true" />
            {generatedFileSummary.privacyShortLabel}
          </span>
        )}

        {/* Claude-style "{Kind} · {EXT}" subtitle (e.g. "Document · MD", "Code · HTML"). */}
        <span className="text-[11px] text-muted-foreground/70 truncate">
          {kindLabel(artifact.type)} · {extLabel(artifact)}
        </span>
      </div>
    </button>
  );
}

// ─── Overflow Row ─────────────────────────────────────────────────────────────

function OverflowRow({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-center gap-2 rounded-xl border border-border/40',
        'bg-muted/20 hover:bg-muted/40 transition-colors py-2',
      )}
      aria-label={`View ${count} more artifacts`}
    >
      <span className="text-xs font-semibold text-muted-foreground">+{count} more</span>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const MAX_VISIBLE = 3;

export function InlineArtifactCards({ artifacts, onOpen, className }: InlineArtifactCardsProps) {
  const { selectArtifact, setPanelOpen } = useArtifactsStore();

  const openArtifact = useCallback(
    (id: string) => {
      selectArtifact(id);
      setPanelOpen(true);
      onOpen?.(id);
    },
    [selectArtifact, setPanelOpen, onOpen],
  );

  const openFirst = useCallback(() => {
    const first = artifacts[0];
    if (first) openArtifact(first.id);
  }, [artifacts, openArtifact]);

  if (artifacts.length === 0) return null;

  const visible = artifacts.slice(0, MAX_VISIBLE);
  const overflow = artifacts.length - MAX_VISIBLE;

  return (
    <div className={cn('flex flex-col gap-2 mt-3', className)} role="list" aria-label="Artifacts">
      {visible.map((artifact) => (
        <div key={artifact.id} role="listitem">
          <ArtifactFullCard artifact={artifact} onClick={() => openArtifact(artifact.id)} />
        </div>
      ))}
      {overflow > 0 && (
        <div role="listitem">
          <OverflowRow count={overflow} onClick={openFirst} />
        </div>
      )}
      {/* Download-all: matches claude.ai's button beneath a multi-file response.
          Reuses the shared downloadAllArtifacts helper (ponytail — same impl as
          the artifact panel header). */}
      {artifacts.length > 1 && (
        <button
          type="button"
          onClick={() => {
            toast.promise(downloadAllArtifacts(artifacts), {
              loading: 'Preparing artifact download…',
              success: 'Artifact download ready',
              error: (error) =>
                error instanceof Error ? error.message : 'Could not download artifacts',
            });
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FolderDown className="h-3.5 w-3.5" aria-hidden="true" />
          Download all
        </button>
      )}
    </div>
  );
}
