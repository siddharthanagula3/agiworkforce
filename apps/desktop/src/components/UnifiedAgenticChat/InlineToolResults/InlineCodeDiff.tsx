import { FileCode, Copy, ChevronDown, ChevronUp, Plus, Minus, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';

export interface CodeDiffData {
  filePath: string;
  before?: string;
  after?: string;
  diff?: string;
  language?: string;
  operation?: 'create' | 'edit' | 'delete' | 'read';
  success?: boolean;
  error?: string;
}

export const InlineCodeDiff: React.FC<ToolResultProps> = ({ result, status: _status }) => {
  const [expanded, setExpanded] = useState(false);

  const data = result?.data as CodeDiffData | undefined;
  if (!data) return null;

  const { filePath, operation = 'edit', before = '', after = '', success = true, error } = data;

  if (!success || error) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <div className="text-red-400">⚠</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">{filePath}</p>
            <p className="text-xs text-muted-foreground mt-1">{error || 'Operation failed'}</p>
          </div>
        </div>
      </div>
    );
  }

  const operationColor =
    operation === 'create'
      ? 'text-emerald-400'
      : operation === 'delete'
        ? 'text-red-400'
        : operation === 'read'
          ? 'text-blue-400'
          : 'text-amber-400';

  const operationLabel =
    operation === 'create'
      ? 'Created'
      : operation === 'delete'
        ? 'Deleted'
        : operation === 'read'
          ? 'Read'
          : 'Modified';

  // Calculate line changes
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;
  const additions = Math.max(0, afterLines - beforeLines);
  const deletions = Math.max(0, beforeLines - afterLines);

  const content =
    operation === 'read'
      ? after
      : `${before ? '- ' + before.split('\n')[0] : ''}${before && after ? '\n' : ''}${after ? '+ ' + after.split('\n')[0] : ''}`;

  return (
    <div className="inline-code-diff mt-3 rounded-lg border border-border/50 overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={`text-xs font-mono font-medium truncate ${operationColor}`}>
            {operationLabel}
          </span>
          <span className="text-xs font-mono text-muted-foreground truncate">{filePath}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {additions > 0 && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Plus className="h-3 w-3" />
              {additions}
            </span>
          )}
          {deletions > 0 && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <Minus className="h-3 w-3" />
              {deletions}
            </span>
          )}

          {before && after && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="h-6 w-6 p-0"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}

          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              const textToCopy = operation === 'read' ? after : `${before}${after}`;
              navigator.clipboard.writeText(textToCopy);
              toast.success('Copied to clipboard', {
                icon: <Check className="h-4 w-4" />,
                duration: 2000,
              });
            }}
            className="h-6 w-6 p-0"
            title="Copy to clipboard"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content Preview */}
      {!expanded && (
        <div className="px-3 py-2 bg-surface-base/50 border-t border-border/30 text-xs text-muted-foreground font-mono line-clamp-2 whitespace-pre-wrap">
          {content}
        </div>
      )}

      {/* Full Diff */}
      {expanded && before && after && (
        <div className="p-3 space-y-2 max-h-96 overflow-auto bg-surface-base/30">
          {/* Before */}
          <div className="space-y-1">
            <div className="text-xs font-mono text-red-400 font-medium">- Before</div>
            <pre className="text-xs font-mono text-muted-foreground bg-surface-base rounded p-2 overflow-auto whitespace-pre-wrap break-words">
              {before}
            </pre>
          </div>

          {/* After */}
          <div className="space-y-1">
            <div className="text-xs font-mono text-emerald-400 font-medium">+ After</div>
            <pre className="text-xs font-mono text-muted-foreground bg-surface-base rounded p-2 overflow-auto whitespace-pre-wrap break-words">
              {after}
            </pre>
          </div>
        </div>
      )}

      {/* Read-only content */}
      {expanded && operation === 'read' && after && (
        <div className="p-3 bg-surface-base/30">
          <pre className="text-xs font-mono text-muted-foreground overflow-auto whitespace-pre-wrap break-words">
            {after}
          </pre>
        </div>
      )}
    </div>
  );
};
