/**
 * ArtifactThumbnailCard — inline clickable card rendered after an assistant
 * message when `message.artifacts` is non-empty.
 *
 * Clicking opens the existing ArtifactPanel via useArtifactStore.
 * Trust-boundary chips (privacy / source-surface labels) are preserved from
 * the GeneratedFilePresentation when a generatedFile / computeSession is
 * attached to the artifact metadata; for plain local artifacts they are omitted.
 */

import { useCallback } from 'react';
import {
  Archive,
  ChevronRight,
  Code2,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Presentation,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useArtifactStore } from '../../../stores/artifactStore';
import type { Artifact, ArtifactType } from '../../../types/chat';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kindLabel(type: ArtifactType): string {
  switch (type) {
    case 'html':
      return 'HTML';
    case 'react':
    case 'component':
      return 'React';
    case 'svg':
      return 'SVG';
    case 'mermaid':
    case 'diagram':
      return 'Diagram';
    case 'code':
      return 'Code';
    case 'markdown':
      return 'Markdown';
    case 'document':
      return 'Document';
    case 'chart':
      return 'Chart';
    case 'table':
    case 'spreadsheet':
      return 'Table';
    case 'presentation':
      return 'Slides';
    case 'image':
      return 'Image';
    default:
      return 'File';
  }
}

function KindIcon({ type, className }: { type: ArtifactType; className?: string }) {
  const cls = cn('shrink-0', className);
  switch (type) {
    case 'html':
      return <Globe className={cls} aria-hidden />;
    case 'react':
    case 'component':
      return <Code2 className={cls} aria-hidden />;
    case 'svg':
    case 'image':
      return <ImageIcon className={cls} aria-hidden />;
    case 'table':
    case 'spreadsheet':
      return <FileSpreadsheet className={cls} aria-hidden />;
    case 'presentation':
      return <Presentation className={cls} aria-hidden />;
    case 'mermaid':
    case 'diagram':
    case 'chart':
      return <Archive className={cls} aria-hidden />;
    default:
      return <FileText className={cls} aria-hidden />;
  }
}

function badgeColorClass(type: ArtifactType): string {
  switch (type) {
    case 'html':
      return 'bg-orange-500/15 text-orange-400';
    case 'react':
    case 'component':
      return 'bg-sky-500/15 text-sky-400';
    case 'svg':
      return 'bg-violet-500/15 text-violet-400';
    case 'mermaid':
    case 'diagram':
    case 'chart':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'code':
      return 'bg-amber-500/15 text-amber-400';
    case 'image':
      return 'bg-fuchsia-500/15 text-fuchsia-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/** First 3 non-empty lines of content for non-renderable types. */
function codePreview(artifact: Artifact): string | null {
  if (['html', 'react', 'svg', 'component'].includes(artifact.type)) return null;
  const lines = artifact.content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);
  return lines.length > 0 ? lines.join('\n') : null;
}

// ─── Single card ─────────────────────────────────────────────────────────────

interface SingleCardProps {
  artifact: Artifact;
  onClick: () => void;
}

function SingleCard({ artifact, onClick }: SingleCardProps) {
  const canRender = ['html', 'react', 'svg', 'component'].includes(artifact.type);
  const preview = codePreview(artifact);

  return (
    <button
      type="button"
      data-testid="artifact-thumbnail-card"
      onClick={onClick}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-border/40',
        'bg-muted/30 hover:bg-muted/60 transition-colors text-left',
        'w-[80px] shrink-0',
      )}
      aria-label={`Open artifact: ${artifact.title || 'Untitled'}`}
    >
      {/* Thumbnail / preview area — 80×60 */}
      <div className="relative h-[60px] w-full overflow-hidden bg-muted/50">
        {canRender ? (
          <iframe
            title={artifact.title || 'Artifact preview'}
            sandbox="allow-scripts"
            srcDoc={`<html><head><meta charset="UTF-8"><style>body{margin:0;padding:4px;font-size:7px;overflow:hidden;background:#fff}*{max-width:100%}</style></head><body>${artifact.content.slice(0, 800)}</body></html>`}
            className="pointer-events-none h-full w-full scale-[0.4] origin-top-left"
            style={{ width: '250%', height: '250%' }}
            aria-hidden
          />
        ) : preview ? (
          <pre className="pointer-events-none h-full w-full overflow-hidden px-1.5 py-1 text-[7px] leading-tight font-mono text-muted-foreground/80 whitespace-pre-wrap">
            {preview}
          </pre>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <KindIcon type={artifact.type} className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <ChevronRight
            className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden
          />
        </div>
      </div>

      {/* Label area */}
      <div className="flex flex-col gap-0.5 px-1.5 py-1">
        <span className="block max-w-full truncate text-[9px] font-medium text-foreground leading-tight">
          {artifact.title || 'Untitled'}
        </span>
        <span
          className={cn(
            'inline-block w-fit rounded px-1 py-0.5 text-[8px] font-semibold uppercase leading-tight tracking-wide',
            badgeColorClass(artifact.type),
          )}
        >
          {kindLabel(artifact.type)}
        </span>
      </div>
    </button>
  );
}

// ─── Overflow card ────────────────────────────────────────────────────────────

function OverflowCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="artifact-overflow-card"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-border/40',
        'bg-muted/30 hover:bg-muted/60 transition-colors',
        'w-[80px] h-[100px] shrink-0 gap-1',
      )}
      aria-label={`View ${count} more artifacts`}
    >
      <Layers className="h-4 w-4 text-muted-foreground/60" aria-hidden />
      <span className="text-sm font-semibold text-muted-foreground">+{count}</span>
      <span className="text-[9px] text-muted-foreground/70">more</span>
    </button>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface ArtifactThumbnailRowProps {
  artifacts: Artifact[];
  className?: string;
}

const MAX_VISIBLE = 3;

export function ArtifactThumbnailRow({ artifacts, className }: ArtifactThumbnailRowProps) {
  const setActiveArtifact = useArtifactStore((s) => s.setActiveArtifact);
  const openPanel = useArtifactStore((s) => s.openPanel);

  const open = useCallback(
    (id: string) => {
      setActiveArtifact(id);
      openPanel();
    },
    [setActiveArtifact, openPanel],
  );

  const openFirst = useCallback(() => {
    const first = artifacts[0];
    if (first) open(first.id);
  }, [artifacts, open]);

  if (artifacts.length === 0) return null;

  const visible = artifacts.slice(0, MAX_VISIBLE);
  const overflow = artifacts.length - MAX_VISIBLE;

  return (
    <div
      data-testid="artifact-thumbnail-row"
      className={cn('flex flex-wrap gap-2 mt-3', className)}
      role="list"
      aria-label="Generated artifacts"
    >
      {visible.map((artifact) => (
        <div key={artifact.id} role="listitem">
          <SingleCard artifact={artifact} onClick={() => open(artifact.id)} />
        </div>
      ))}
      {overflow > 0 && (
        <div role="listitem">
          <OverflowCard count={overflow} onClick={openFirst} />
        </div>
      )}
    </div>
  );
}
