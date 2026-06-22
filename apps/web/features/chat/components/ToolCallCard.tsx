'use client';

import React, { useState, useMemo, memo, useCallback } from 'react';
import { AlertCircle, Copy, Check, Play, X as XIcon } from 'lucide-react';
import { InlineToolCall, type InlineToolCallStatus } from '@agiworkforce/unified-chat';
import { cn } from '@shared/lib/utils';

// ─── Code language detection ──────────────────────────────────────────────────

/**
 * Tool names that carry executable code in their parameters.
 * When matched, we look for a `language` and `code` field to highlight.
 */
const CODE_EXECUTION_TOOLS = new Set([
  'execute_code',
  'code_execute',
  'run_code',
  'execute',
  'computer',
  'jupyter_execute',
]);

/**
 * Returns the { language, code } pair to highlight from a tool's parameters,
 * or null when the parameters are not code-bearing.
 */
export function detectCodeBlock(
  toolName: string,
  parameters?: Record<string, unknown>,
): { language: string; code: string } | null {
  if (!parameters) return null;
  const n = toolName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const isCodeTool =
    CODE_EXECUTION_TOOLS.has(n) ||
    n.includes('execute') ||
    n.includes('run_code') ||
    n.includes('computer');
  if (!isCodeTool) return null;

  const language = typeof parameters['language'] === 'string' ? parameters['language'] : 'python';
  const code =
    typeof parameters['code'] === 'string'
      ? parameters['code']
      : typeof parameters['command'] === 'string'
        ? parameters['command']
        : null;
  if (!code) return null;
  return { language, code };
}

// ─── Syntax-highlighted code block ───────────────────────────────────────────

/**
 * Renders a labeled, syntax-highlighted code block.
 * Reuses the same CSS class names as MarkdownContent.tsx (`code-block-*`).
 * Highlight.js classes are applied via the `hljs` class on the <code> element
 * just as rehype-highlight would do, so the same global CSS theme applies.
 */
function HighlightedCodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [code],
  );

  return (
    <div className="code-block-container group relative">
      <div className="code-block-header-bar">
        <span className="code-block-lang-label">{language}</span>
        <button
          type="button"
          aria-label={copied ? 'Code copied' : 'Copy code'}
          onClick={handleCopy}
          className="h-6 gap-1 px-1.5 text-[10px] flex items-center rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 opacity-0 transition-opacity group-hover:opacity-100"
        >
          {copied ? (
            <Check className="h-2.5 w-2.5" aria-hidden="true" />
          ) : (
            <Copy className="h-2.5 w-2.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-block-body">
        <pre className="overflow-auto max-h-48">
          <code className={`language-${language}`}>{code}</code>
        </pre>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'awaiting_approval'
  | 'cancelled';

export interface ToolCall {
  id: string;
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  requiresApproval?: boolean;
  approved?: boolean;
  approvedAt?: string;
  defaultExpanded?: boolean;
}

interface ToolCallCardProps {
  toolCall: ToolCall;
  onCancel?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  showParameters?: boolean;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInlineStatus(status: ToolCallStatus): InlineToolCallStatus {
  switch (status) {
    case 'running':
    case 'awaiting_approval':
      return 'running';
    case 'complete':
      return 'success';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'partial';
    case 'pending':
    default:
      return 'pending';
  }
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ToolCallCardComponent: React.FC<ToolCallCardProps> = ({
  toolCall,
  onCancel,
  onApprove,
  onReject,
  showParameters = true,
  className,
}) => {
  const [expanded, setExpanded] = useState(
    toolCall.defaultExpanded ?? toolCall.status === 'awaiting_approval',
  );
  const [copied, setCopied] = useState(false);

  const needsApproval = toolCall.status === 'awaiting_approval';
  const canCancel = toolCall.status === 'running' && onCancel;
  const hasParameters = toolCall.parameters && Object.keys(toolCall.parameters).length > 0;
  const inlineStatus = useMemo(() => toInlineStatus(toolCall.status), [toolCall.status]);

  // Detect whether this tool carries executable code to highlight (execute_code et al.)
  const codeBlock = useMemo(
    () => detectCodeBlock(toolCall.name, toolCall.parameters),
    [toolCall.name, toolCall.parameters],
  );

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = JSON.stringify(
        { tool: toolCall.name, parameters: toolCall.parameters ?? {}, status: toolCall.status },
        null,
        2,
      );
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [toolCall.name, toolCall.parameters, toolCall.status],
  );

  // The expanded body composes approval prompt + request + response sections,
  // preserving the web-specific behavior the team-lead asked us to retain.
  const body = (
    <div className="space-y-2 -m-4 p-2">
      {/* Approval prompt */}
      {needsApproval && (onApprove || onReject) && (
        <div className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
          <AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <p className="flex-1 text-xs text-yellow-900 dark:text-yellow-100">
            This tool requires approval before execution.
          </p>
          <div className="flex gap-1.5">
            {onApprove && (
              <button
                type="button"
                onClick={() => onApprove(toolCall.id)}
                className="flex items-center gap-1 h-6 px-2 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <Play className="h-2.5 w-2.5" />
                Approve
              </button>
            )}
            {onReject && (
              <button
                type="button"
                onClick={() => onReject(toolCall.id)}
                className="h-6 px-2 text-xs font-medium rounded border border-border bg-background hover:bg-muted transition-colors"
              >
                Reject
              </button>
            )}
          </div>
        </div>
      )}

      {/* Parameters / request */}
      {showParameters && hasParameters && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-0.5">
            Request
          </p>
          {codeBlock ? (
            // Code-execution tool: render language-labeled, syntax-highlighted block
            <HighlightedCodeBlock language={codeBlock.language} code={codeBlock.code} />
          ) : (
            // Generic tool: render raw JSON
            <pre className="overflow-auto max-h-40 rounded bg-muted/50 p-2.5 text-xs font-mono leading-relaxed scrollbar-thin">
              {JSON.stringify(toolCall.parameters, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Result */}
      {toolCall.result && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-0.5">
            Response
          </p>
          <pre className="overflow-auto max-h-48 rounded bg-muted/50 p-2.5 text-xs font-mono leading-relaxed scrollbar-thin">
            {toolCall.result}
          </pre>
        </div>
      )}

      {showParameters && !hasParameters && !toolCall.result && (
        <p className="text-xs text-muted-foreground/50 italic px-1">No parameters</p>
      )}
    </div>
  );

  // Right-edge action chips (cancel + copy). These sit visually inside the bar
  // by absolutely positioning them in a wrapping div, since InlineToolCall owns
  // the bar layout. We render them adjacent so they remain part of the same row.
  return (
    <div
      className={cn(
        'group relative my-0.5',
        needsApproval &&
          'rounded-lg border border-yellow-300/40 dark:border-yellow-700/40 bg-yellow-50/30 dark:bg-yellow-950/10 px-1',
        className,
      )}
    >
      <InlineToolCall
        id={toolCall.id}
        label={toolCall.name}
        status={inlineStatus}
        iconStyle="badge"
        argSummary={
          toolCall.durationMs != null && toolCall.status === 'complete'
            ? formatDuration(toolCall.durationMs)
            : undefined
        }
        open={expanded}
        onOpenChange={setExpanded}
        body={body}
      />

      {/* Hover-revealed action chips, anchored to the top-right of the bar. */}
      <div
        className={cn(
          'pointer-events-none absolute right-1 top-1 flex items-center gap-1.5',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto',
          // Always show cancel button while running (it's actionable, not decorative)
          canCancel && 'opacity-100 pointer-events-auto',
        )}
      >
        {canCancel && (
          <button
            type="button"
            aria-label="Cancel"
            onClick={(e) => {
              e.stopPropagation();
              onCancel!(toolCall.id);
            }}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <XIcon className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy'}
          onClick={handleCopy}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
