'use client';

/**
 * InlineTerminalOutput
 *
 * Renders terminal command execution results with:
 * - Command display ($ prefix, monospace)
 * - Stdout/stderr output with expand/collapse
 * - Exit code badge (green 0, amber non-zero, red error)
 * - Copy-to-clipboard
 * - Error message panel
 */

import { useState } from 'react';
import { Terminal, Copy, Check, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ToolResultProps } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TerminalOutputData {
  command?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  exit_code?: number;
  success?: boolean;
  error?: string;
  content?: string;
  toolName?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PREVIEW_LINES = 5;

export const InlineTerminalOutput: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const data = result?.data as TerminalOutputData | undefined;

  // Error state (even if data is null)
  if (status === 'error' || status === 'failed') {
    return (
      <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Command failed</p>
            {(data?.error || result?.error) && (
              <p className="text-xs text-muted-foreground mt-1">{data?.error || result?.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const command = data.command || data.toolName || 'command';
  const stdout = data.stdout || '';
  const stderr = data.stderr || '';
  const structuredContent =
    typeof data.content === 'string' && data.content.trim().length > 0 ? data.content : '';

  // Build output: prefer stdout, then stderr, then structured content, then JSON dump
  const fallbackJson =
    !stdout && !stderr && !structuredContent
      ? (() => {
          const clone = { ...data } as Record<string, unknown>;
          delete clone['command'];
          delete clone['stdout'];
          delete clone['stderr'];
          delete clone['toolName'];
          if (Object.keys(clone).length === 0) return '';
          try {
            return JSON.stringify(clone, null, 2);
          } catch {
            return '';
          }
        })()
      : '';

  const output = stdout || stderr || structuredContent || fallbackJson;
  const exitCode = data.exitCode ?? data.exit_code ?? 0;
  const hasError = !data.success && data.success !== undefined ? true : !!data.error || !!stderr;

  const lines = output.split('\n');
  const preview = lines.slice(0, PREVIEW_LINES).join('\n');
  const hasMore = lines.length > PREVIEW_LINES;

  // Running state
  if (status === 'running') {
    return (
      <div className="mt-3 p-3 rounded-lg border border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="text-sm text-muted-foreground font-mono">$ {command}</span>
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 rounded-lg border border-border/50 overflow-hidden bg-zinc-950 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="text-xs font-mono text-emerald-400 truncate">$ {command}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Exit code badge */}
          {hasError ? (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Error
            </span>
          ) : exitCode === 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              <Check className="h-2.5 w-2.5" />0
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
              exit {exitCode}
            </span>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="h-6 px-1.5 flex items-center gap-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> +{lines.length - PREVIEW_LINES} lines
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Copy output"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Output */}
      <div
        className={cn(
          'px-3 py-2 font-mono text-xs max-h-64 overflow-auto',
          hasError ? 'text-red-300' : 'text-emerald-300',
        )}
      >
        <pre className="whitespace-pre-wrap break-words">{expanded ? output : preview}</pre>
        {hasMore && !expanded && (
          <div className="text-zinc-500 mt-1 text-xs italic">
            ... ({lines.length - PREVIEW_LINES} more lines)
          </div>
        )}
      </div>

      {/* Error panel */}
      {data.error && (
        <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/20 text-xs text-red-300">
          {data.error}
        </div>
      )}
    </div>
  );
};
