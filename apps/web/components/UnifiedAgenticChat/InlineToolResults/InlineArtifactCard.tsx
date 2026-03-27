import {
  AlertCircle,
  BarChart3,
  ExternalLink,
  FileCode,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Network,
} from 'lucide-react';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { cn } from '@/lib/utils';

interface ArtifactData {
  id?: string;
  title?: string;
  type?: string;
  language?: string;
  content?: string;
  contentPreview?: string;
  mimeType?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  status?: string;
}

interface ArtifactTypeConfig {
  icon: React.ReactNode;
  label: string;
  accent: string;
  badge: string;
  actionLabel: string;
}

interface ArtifactPreviewCardProps {
  artifact?: ArtifactData;
  status?: ToolResultProps['status'];
  onOpen?: () => void;
  className?: string;
}

const TYPE_CONFIGS: Record<string, ArtifactTypeConfig> = {
  code: {
    icon: <FileCode className="h-4 w-4" />,
    label: 'Code',
    accent: 'text-blue-400',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    actionLabel: 'Open code',
  },
  html: {
    icon: <Globe className="h-4 w-4" />,
    label: 'HTML',
    accent: 'text-cyan-400',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
    actionLabel: 'Open preview',
  },
  markdown: {
    icon: <FileText className="h-4 w-4" />,
    label: 'Markdown',
    accent: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
    actionLabel: 'Open document',
  },
  document: {
    icon: <FileText className="h-4 w-4" />,
    label: 'Document',
    accent: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    actionLabel: 'Open document',
  },
  spreadsheet: {
    icon: <FileSpreadsheet className="h-4 w-4" />,
    label: 'Spreadsheet',
    accent: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    actionLabel: 'Open sheet',
  },
  table: {
    icon: <FileSpreadsheet className="h-4 w-4" />,
    label: 'Table',
    accent: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    actionLabel: 'Open table',
  },
  image: {
    icon: <ImageIcon className="h-4 w-4" />,
    label: 'Image',
    accent: 'text-pink-400',
    badge: 'bg-pink-500/15 text-pink-300 border-pink-500/20',
    actionLabel: 'Open image',
  },
  chart: {
    icon: <BarChart3 className="h-4 w-4" />,
    label: 'Chart',
    accent: 'text-orange-400',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
    actionLabel: 'Open chart',
  },
  diagram: {
    icon: <Network className="h-4 w-4" />,
    label: 'Diagram',
    accent: 'text-purple-400',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/20',
    actionLabel: 'Open diagram',
  },
  mermaid: {
    icon: <Network className="h-4 w-4" />,
    label: 'Mermaid',
    accent: 'text-purple-400',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/20',
    actionLabel: 'Open diagram',
  },
  presentation: {
    icon: <LayoutTemplate className="h-4 w-4" />,
    label: 'Presentation',
    accent: 'text-fuchsia-400',
    badge: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20',
    actionLabel: 'Open slides',
  },
};

const DEFAULT_TYPE_CONFIG: ArtifactTypeConfig = {
  icon: <FileCode className="h-4 w-4" />,
  label: 'Artifact',
  accent: 'text-blue-400',
  badge: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  actionLabel: 'Open artifact',
};

function getPreviewText(artifact?: ArtifactData): string {
  const directPreview = artifact?.contentPreview?.trim();
  if (directPreview) {
    return directPreview;
  }

  const content = artifact?.content?.trim();
  if (!content) {
    return '';
  }

  return content.split('\n').slice(0, 4).join('\n');
}

function getTypeConfig(artifact?: ArtifactData): ArtifactTypeConfig {
  const type = artifact?.type?.toLowerCase() ?? 'code';
  return TYPE_CONFIGS[type] ?? DEFAULT_TYPE_CONFIG;
}

function getTypeBadgeLabel(artifact?: ArtifactData, fallback = 'Artifact'): string {
  const type = artifact?.type?.toLowerCase();
  if (type === 'code' && artifact?.language) {
    return artifact.language.toUpperCase();
  }
  if (type === 'document' && artifact?.mimeType) {
    if (artifact.mimeType.includes('word')) return 'DOCX';
    if (artifact.mimeType.includes('pdf')) return 'PDF';
  }
  return type ? type.toUpperCase() : fallback.toUpperCase();
}

export function ArtifactPreviewCard({
  artifact,
  status,
  onOpen,
  className,
}: ArtifactPreviewCardProps) {
  if (status === 'running') {
    return (
      <div
        className={cn(
          'mt-3 flex items-center gap-2 rounded-lg border border-border/50 bg-surface-elevated p-3',
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
        <span className="text-sm text-muted-foreground">Creating artifact...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div
        className={cn(
          'mt-3 rounded-lg border border-destructive/30 bg-surface-elevated p-3',
          className,
        )}
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm font-medium text-red-300">Artifact creation failed</p>
        </div>
      </div>
    );
  }

  if (!artifact) return null;

  const config = getTypeConfig(artifact);
  const preview = getPreviewText(artifact);
  const title = artifact.title?.trim() || 'Generated artifact';
  const badgeLabel = getTypeBadgeLabel(artifact, config.label);

  return (
    <div
      className={cn(
        'mt-3 overflow-hidden rounded-xl border border-border/50 bg-surface-elevated',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/30 bg-surface-overlay/30 px-3 py-2.5">
        <span className={cn('shrink-0', config.accent)}>{config.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">Ready to inspect in sidecar</div>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide',
            config.badge,
          )}
        >
          {badgeLabel}
        </span>
      </div>

      {preview && (
        <div className="border-b border-border/20 bg-surface-base/40 px-3 py-2">
          <pre className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
            {preview}
          </pre>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="truncate text-[11px] text-muted-foreground">
          {artifact.url || artifact.mimeType || config.label}
        </div>
        {onOpen && (
          <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={onOpen}>
            <ExternalLink className="h-3 w-3" />
            {config.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function InlineArtifactCard({ result, status, onExpand }: ToolResultProps) {
  const artifact = result?.data as ArtifactData | undefined;

  return (
    <ArtifactPreviewCard artifact={artifact} status={status} onOpen={() => onExpand?.('preview')} />
  );
}
