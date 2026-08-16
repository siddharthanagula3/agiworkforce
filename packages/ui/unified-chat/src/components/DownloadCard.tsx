import { Code2, FileText, FlaskConical, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '@agiworkforce/ui';
import type { Artifact } from '../lib/types';

export interface DownloadCardProps {
  artifact: Artifact;
  onClick?: () => void;
  onDownload?: () => void;
}

function ArtifactIcon({ type }: { type: Artifact['type'] }) {
  switch (type) {
    case 'document':
      return <FileText size={16} className="shrink-0 text-[var(--chat-text-muted)]" />;
    case 'research':
      return <FlaskConical size={16} className="shrink-0 text-[var(--chat-text-muted)]" />;
    default:
      return <Code2 size={16} className="shrink-0 text-[var(--chat-text-muted)]" />;
  }
}

function getTypeLabel(artifact: Artifact): string {
  switch (artifact.type) {
    case 'html':
      return 'Code · HTML';
    case 'react':
      return 'Code · React';
    case 'markdown':
      return 'Document · Markdown';
    case 'json':
      return 'Data · JSON';
    case 'svg':
      return 'Code · SVG';
    case 'mermaid':
      return 'Code · Mermaid';
    case 'code':
      return artifact.language ? `Code · ${artifact.language.toUpperCase()}` : 'Code';
    case 'document':
      return 'Document';
    case 'research':
      return 'Research';
    case 'image':
      return 'Image';
    default:
      return 'Artifact';
  }
}

export function DownloadCard({ artifact, onClick, onDownload }: DownloadCardProps) {
  const content = (
    <>
      <ArtifactIcon type={artifact.type} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate text-sm font-medium text-[var(--chat-text-primary)]">
          {artifact.title ?? 'Untitled artifact'}
        </span>
        <span className="text-[12px] text-[var(--chat-text-muted)]">{getTypeLabel(artifact)}</span>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 my-2',
        'rounded-lg border border-[var(--chat-border)]',
        'bg-[var(--chat-surface-elevated)]',
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${artifact.title ?? 'Untitled artifact'}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
      )}

      {onDownload && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download artifact"
          onClick={onDownload}
          className="h-8 w-8 shrink-0 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
        >
          <Download size={15} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
