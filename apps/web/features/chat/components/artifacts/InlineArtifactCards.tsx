'use client';

import { useCallback } from 'react';
import { FileCode, Code2, FileText, Image, Globe, ChevronRight } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useArtifactsStore } from '../../stores/artifacts-store';
import type { ArtifactData } from './ArtifactPreview';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InlineArtifactCardsProps {
  artifacts: ArtifactData[];
  /** Called when user clicks a card or the overflow card — opens the panel. */
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
    default:
      return 'File';
  }
}

/** Icon for each artifact type. */
function TypeIcon({ type, className }: { type: ArtifactData['type']; className?: string }) {
  const cls = cn('shrink-0', className);
  switch (type) {
    case 'html':
      return <Globe className={cls} aria-hidden="true" />;
    case 'react':
      return <Code2 className={cls} aria-hidden="true" />;
    case 'svg':
      return <Image className={cls} aria-hidden="true" />;
    case 'mermaid':
      return <FileCode className={cls} aria-hidden="true" />;
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
    case 'mermaid':
      return 'bg-emerald-500/15 text-emerald-400';
    case 'code':
      return 'bg-amber-500/15 text-amber-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/**
 * Returns a short code preview (first 3 non-empty lines) for non-renderable types.
 * For HTML/React/SVG we show the iframe below, so no text preview needed.
 */
function codePreview(artifact: ArtifactData): string | null {
  if (['html', 'react', 'svg'].includes(artifact.type)) return null;
  const lines = artifact.content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);
  return lines.join('\n');
}

// ─── Single Card ─────────────────────────────────────────────────────────────

function ArtifactThumbCard({ artifact, onClick }: { artifact: ArtifactData; onClick: () => void }) {
  const canRender = ['html', 'react', 'svg', 'mermaid'].includes(artifact.type);
  const preview = codePreview(artifact);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-border/40',
        'bg-muted/30 hover:bg-muted/60 transition-colors text-left',
        'w-[80px] shrink-0',
      )}
      aria-label={`Open artifact: ${artifact.title || 'Untitled'}`}
    >
      {/* Thumbnail area — 80x60 */}
      <div className="relative h-[60px] w-full overflow-hidden bg-muted/50">
        {canRender ? (
          /* Tiny iframe preview — sandboxed, pointer-events off */
          <iframe
            title={artifact.title || 'Artifact preview'}
            sandbox="allow-scripts"
            srcDoc={`<html><head><meta charset="UTF-8"><style>body{margin:0;padding:4px;font-size:7px;overflow:hidden;background:#fff}*{max-width:100%}</style></head><body>${artifact.content.slice(0, 800)}</body></html>`}
            className="pointer-events-none h-full w-full scale-[0.4] origin-top-left"
            style={{ width: '250%', height: '250%' }}
            aria-hidden="true"
          />
        ) : preview ? (
          /* Code preview */
          <pre className="pointer-events-none h-full w-full overflow-hidden px-1.5 py-1 text-[7px] leading-tight font-mono text-muted-foreground/80 whitespace-pre-wrap">
            {preview}
          </pre>
        ) : (
          /* Fallback icon */
          <div className="flex h-full w-full items-center justify-center">
            <TypeIcon type={artifact.type} className="h-6 w-6 text-muted-foreground/40" />
          </div>
        )}
        {/* Hover overlay with open indicator */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <ChevronRight
            className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
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
            badgeClass(artifact.type),
          )}
        >
          {typeBadge(artifact.type)}
        </span>
      </div>
    </button>
  );
}

// ─── Overflow Card ────────────────────────────────────────────────────────────

function OverflowCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-border/40',
        'bg-muted/30 hover:bg-muted/60 transition-colors',
        'w-[80px] h-[100px] shrink-0 gap-1',
      )}
      aria-label={`View ${count} more artifacts`}
    >
      <span className="text-sm font-semibold text-muted-foreground">+{count}</span>
      <span className="text-[9px] text-muted-foreground/70">more</span>
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
    <div className={cn('flex flex-wrap gap-2 mt-3', className)} role="list" aria-label="Artifacts">
      {visible.map((artifact) => (
        <div key={artifact.id} role="listitem">
          <ArtifactThumbCard artifact={artifact} onClick={() => openArtifact(artifact.id)} />
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
