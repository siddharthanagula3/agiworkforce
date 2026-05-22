import { Brain, Loader2, AlertCircle, Clock } from 'lucide-react';
import type { ToolResultProps } from './index';
import { cn } from '@/lib/utils';

interface MemoryData {
  title?: string;
  content?: string;
  memoryType?: 'preference' | 'pattern' | 'decision' | string;
  importance?: 'low' | 'medium' | 'high';
  createdAt?: string;
}

const IMPORTANCE_CONFIG = {
  low: { label: 'Low', color: 'text-muted-foreground', bar: 'bg-muted-foreground', width: 'w-1/3' },
  medium: { label: 'Medium', color: 'text-amber-400', bar: 'bg-amber-500', width: 'w-2/3' },
  high: { label: 'High', color: 'text-red-400', bar: 'bg-red-500', width: 'w-full' },
};

const TYPE_BADGE: Record<string, string> = {
  preference: 'bg-blue-500/20 text-blue-300',
  pattern: 'bg-purple-500/20 text-purple-300',
  decision: 'bg-amber-500/20 text-amber-300',
} as const;

export function InlineMemoryCard({ result, status }: ToolResultProps) {
  const data = result?.data as MemoryData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-card/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Accessing memory...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-card/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Memory operation failed</p>
          {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    title = 'Memory',
    content,
    memoryType = 'preference',
    importance = 'medium',
    createdAt,
  } = data;

  const impCfg = IMPORTANCE_CONFIG[importance] ?? IMPORTANCE_CONFIG.medium;
  const badgeClass = TYPE_BADGE[memoryType] ?? 'bg-muted-foreground/20 text-foreground';

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : undefined;

  return (
    <div className="mt-3 rounded-lg bg-card/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/60 border-b border-white/10">
        <Brain className="h-4 w-4 text-violet-400 shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">{title}</span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', badgeClass)}>
          {memoryType}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {content && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{content}</p>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Importance</span>
              <span className={cn('font-medium', impCfg.color)}>{impCfg.label}</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full rounded-full', impCfg.bar, impCfg.width)} />
            </div>
          </div>

          {formattedDate && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Clock className="h-3 w-3" />
              {formattedDate}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
