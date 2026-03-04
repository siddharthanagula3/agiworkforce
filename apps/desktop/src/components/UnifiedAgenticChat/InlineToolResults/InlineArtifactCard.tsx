import {
  FileCode,
  FileText,
  Image as ImageIcon,
  Sheet,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { cn } from '@/lib/utils';

interface ArtifactData {
  id?: string;
  title?: string;
  type?: 'code' | 'document' | 'image' | 'spreadsheet' | string;
  language?: string;
  contentPreview?: string;
}

interface TypeConfig {
  icon: React.ReactNode;
  label: string;
  color: string;
  badge: string;
}

const TYPE_CONFIG_MAP: Partial<Record<string, TypeConfig>> = {
  code: {
    icon: <FileCode className="h-4 w-4" />,
    label: 'Code',
    color: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300',
  },
  document: {
    icon: <FileText className="h-4 w-4" />,
    label: 'Document',
    color: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300',
  },
  image: {
    icon: <ImageIcon className="h-4 w-4" />,
    label: 'Image',
    color: 'text-pink-400',
    badge: 'bg-pink-500/20 text-pink-300',
  },
  spreadsheet: {
    icon: <Sheet className="h-4 w-4" />,
    label: 'Spreadsheet',
    color: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300',
  },
};

const DEFAULT_TYPE_CONFIG: TypeConfig = {
  icon: <FileCode className="h-4 w-4" />,
  label: 'Code',
  color: 'text-blue-400',
  badge: 'bg-blue-500/20 text-blue-300',
};

export function InlineArtifactCard({ result, status, onExpand }: ToolResultProps) {
  const data = result?.data as ArtifactData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Creating artifact...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Artifact creation failed</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { title = 'Untitled', type = 'code', language, contentPreview } = data;
  const config = TYPE_CONFIG_MAP[type] ?? DEFAULT_TYPE_CONFIG;

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800/60 border-b border-white/10">
        <span className={cn(config.color)}>{config.icon}</span>
        <span className="text-sm font-medium text-zinc-200 flex-1 truncate">{title}</span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', config.badge)}>
          {language ?? config.label}
        </span>
      </div>

      {contentPreview && (
        <div className="px-3 py-2 bg-zinc-950/40 max-h-24 overflow-hidden">
          <pre className="text-xs font-mono text-zinc-500 whitespace-pre-wrap break-words line-clamp-4">
            {contentPreview}
          </pre>
        </div>
      )}

      <div className="px-3 py-2 border-t border-white/5 flex justify-end">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onExpand?.('canvas')}
          className="h-7 gap-1.5 text-xs text-blue-400 hover:text-blue-300"
        >
          <ExternalLink className="h-3 w-3" />
          Open in Canvas
        </Button>
      </div>
    </div>
  );
}
