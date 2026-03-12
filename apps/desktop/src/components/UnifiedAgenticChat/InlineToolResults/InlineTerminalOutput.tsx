import { Terminal, Copy, Loader2, AlertCircle, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import { useSettingsStore } from '../../../stores/settingsStore';

export interface TerminalOutputData {
  command?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  success?: boolean;
  error?: string;
  content?: string;
  toolName?: string;
}

export const InlineTerminalOutput: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const compactMode = useSettingsStore((state) => state.chatPreferences.compactMode);

  const data = result?.data as TerminalOutputData | undefined;

  // Show error state if status indicates failure, even if data is null
  if (status === 'failed' || status === 'error') {
    const errorData = data as TerminalOutputData | undefined;
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Terminal command failed</p>
            {errorData?.error && (
              <p className="text-xs text-muted-foreground mt-1">{errorData.error}</p>
            )}
            {!errorData?.error && result?.error && (
              <p className="text-xs text-muted-foreground mt-1">{result.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // In compact mode, hide terminal output completely
  if (compactMode) {
    return null;
  }

  const { command = '', stdout = '', stderr = '', exitCode = 0, success = true, error } = data;
  const toolName = typeof data.toolName === 'string' ? data.toolName : undefined;
  const structuredContent =
    typeof data.content === 'string' && data.content.trim().length > 0 ? data.content : '';
  const fallbackJson =
    !stdout && !stderr && !structuredContent
      ? (() => {
          const clone = { ...data } as Record<string, unknown>;
          delete clone['command'];
          delete clone['stdout'];
          delete clone['stderr'];
          if (Object.keys(clone).length === 0) return '';
          try {
            return JSON.stringify(clone, null, 2);
          } catch {
            return String(clone);
          }
        })()
      : '';
  const output = stdout || stderr || structuredContent || fallbackJson;
  const displayCommand = command || toolName || 'tool';

  if (status === 'running') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          <span className="text-sm text-muted-foreground font-mono">{displayCommand}</span>
        </div>
      </div>
    );
  }

  const hasError = !success || error || (stderr && stderr.trim());
  const lines = output.split('\n');
  const preview = lines.slice(0, 3).join('\n');
  const hasMore = lines.length > 3;

  return (
    <div className="inline-terminal mt-3 rounded-lg border border-border/50 overflow-hidden bg-black/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-overlay/50 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="text-xs font-mono text-emerald-400 truncate">$ {displayCommand}</span>
        </div>

        <div className="flex items-center gap-2">
          {hasError && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Error
            </span>
          )}
          {!hasError && exitCode === 0 && (
            <span className="text-xs text-emerald-400">Exit code: 0</span>
          )}
          {!hasError && exitCode !== 0 && (
            <span className="text-xs text-amber-400">Exit code: {exitCode}</span>
          )}

          {hasMore && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="h-6 px-2 text-xs"
            >
              {expanded ? 'Collapse' : `+${lines.length - 3} lines`}
            </Button>
          )}

          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(output).catch(() => {});
              toast.success('Output copied to clipboard', {
                icon: <Check className="h-4 w-4" />,
                duration: 2000,
              });
            }}
            className="h-6 w-6 p-0"
            title="Copy output"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Output */}
      <div
        className={cn(
          'p-3 font-mono text-xs text-emerald-300 bg-black/60 max-h-64 overflow-auto',
          hasError && 'text-red-300',
        )}
      >
        <pre className="whitespace-pre-wrap break-words">{expanded ? output : preview}</pre>
        {hasMore && !expanded && (
          <div className="text-muted-foreground mt-2 text-xs italic">
            ... ({lines.length - 3} more lines)
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
};
