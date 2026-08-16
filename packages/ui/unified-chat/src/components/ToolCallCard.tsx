
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { AlertCircle, Check, Copy, Play, X as XIcon } from 'lucide-react';
import { InlineToolCall, type InlineToolCallStatus, type InlineToolKind } from './InlineToolCall';
import { cn } from '../lib/utils';

export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'awaiting_approval'
  | 'cancelled';

export interface ToolCallCardProps {
  id: string;
  name: string;
  status: ToolCallStatus;
  requiresApproval?: boolean;
  args?: Record<string, unknown>;
  commandText?: string;
  showParameters?: boolean;
  result?: string;
  error?: string;
  elapsedMs?: number;
  startedAt?: number;
  kind?: InlineToolKind;
  iconLetter?: string;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  expired?: boolean;
  onResend?: (id: string) => void;
  showCopyAction?: boolean;
  footer?: ReactNode;
  className?: string;
}

const CODE_EXECUTION_TOOLS = new Set([
  'execute_code',
  'code_execute',
  'run_code',
  'execute',
  'computer',
  'jupyter_execute',
]);

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

function toInlineStatus(
  status: ToolCallStatus,
  requiresApproval?: boolean,
  expired?: boolean,
): InlineToolCallStatus {
  if (requiresApproval || status === 'awaiting_approval') return expired ? 'partial' : 'running';
  switch (status) {
    case 'complete':
      return 'success';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'partial';
    case 'running':
      return 'running';
    case 'pending':
    default:
      return 'pending';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const ToolCallCardComponent = ({
  id,
  name,
  status,
  requiresApproval = false,
  args,
  commandText,
  showParameters = true,
  result,
  error,
  elapsedMs,
  startedAt,
  kind,
  iconLetter,
  onApprove,
  onReject,
  onCancel,
  expired = false,
  onResend,
  showCopyAction = true,
  footer,
  className,
}: ToolCallCardProps) => {
  const [copied, setCopied] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const timerStartRef = useRef<number>(startedAt ?? Date.now());

  useEffect(() => {
    if (status !== 'running' || startedAt == null) return;
    timerStartRef.current = startedAt;
    const tick = () => setLiveElapsed(Date.now() - timerStartRef.current);
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [status, startedAt]);

  const isApprovalGated = requiresApproval || status === 'awaiting_approval';
  const showApprovalPrompt =
    isApprovalGated && !expired && (Boolean(onApprove) || Boolean(onReject));
  const showExpiredApproval = isApprovalGated && expired;
  const canCancel = status === 'running' && Boolean(onCancel);
  const hasArgs = args != null && Object.keys(args).length > 0;
  const inlineStatus = useMemo(
    () => toInlineStatus(status, requiresApproval, expired),
    [status, requiresApproval, expired],
  );
  const codeBlock = useMemo(() => detectCodeBlock(name, args), [name, args]);

  const durationLabel =
    status === 'running' && startedAt != null
      ? formatDuration(liveElapsed)
      : elapsedMs != null && status === 'complete'
        ? formatDuration(elapsedMs)
        : undefined;

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = JSON.stringify({ tool: name, args: args ?? commandText ?? {}, status }, null, 2);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [name, args, commandText, status],
  );

  const body =
    showApprovalPrompt ||
    showExpiredApproval ||
    (showParameters && (hasArgs || commandText)) ||
    result ? (
      <div className="space-y-2 -m-4 p-2">
        {showExpiredApproval && (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/50 border border-border">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <p className="flex-1 text-xs text-muted-foreground">
              This approval request expired or is no longer active.
              {onResend ? ' Send a new message to try again.' : ' Send a new message to continue.'}
            </p>
            {onResend && (
              <button
                type="button"
                onClick={() => onResend(id)}
                className="h-6 px-2 text-xs font-medium rounded border border-border bg-background hover:bg-muted transition-colors"
              >
                Resend
              </button>
            )}
          </div>
        )}

        {showApprovalPrompt && (
          <div className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <p className="flex-1 text-xs text-yellow-900 dark:text-yellow-100">
              This tool requires approval before execution.
            </p>
            <div className="flex gap-1.5">
              {onApprove && (
                <button
                  type="button"
                  onClick={() => onApprove(id)}
                  className="flex items-center gap-1 h-6 px-2 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  <Play className="h-2.5 w-2.5" />
                  Approve
                </button>
              )}
              {onReject && (
                <button
                  type="button"
                  onClick={() => onReject(id)}
                  className="h-6 px-2 text-xs font-medium rounded border border-border bg-background hover:bg-muted transition-colors"
                >
                  Reject
                </button>
              )}
            </div>
          </div>
        )}

        {showParameters && (hasArgs || commandText) && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-0.5">
              Request
            </p>
            {codeBlock ? (
              <HighlightedCodeBlock language={codeBlock.language} code={codeBlock.code} />
            ) : commandText ? (
              <pre className="font-mono text-[10px] leading-snug p-2 rounded bg-black/20 border border-white/8 overflow-x-auto max-h-48 overflow-y-auto select-text">
                {commandText}
              </pre>
            ) : (
              <pre className="overflow-auto max-h-40 rounded bg-muted/50 p-2.5 text-xs font-mono leading-relaxed scrollbar-thin">
                {JSON.stringify(args, null, 2)}
              </pre>
            )}
          </div>
        )}

        {result && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-0.5">
              Response
            </p>
            <pre className="overflow-auto max-h-48 rounded bg-muted/50 p-2.5 text-xs font-mono leading-relaxed scrollbar-thin">
              {result}
            </pre>
          </div>
        )}

        {error && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-0.5">
              Error
            </p>
            <pre className="overflow-auto max-h-48 rounded bg-muted/50 p-2.5 text-xs font-mono leading-relaxed text-red-400 scrollbar-thin">
              {error}
            </pre>
          </div>
        )}

        {showParameters && !hasArgs && !commandText && !result && !error && (
          <p className="text-xs text-muted-foreground/50 italic px-1">No parameters</p>
        )}
      </div>
    ) : undefined;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'group relative my-0.5',
          showApprovalPrompt &&
            'rounded-lg border border-yellow-300/40 dark:border-yellow-700/40 bg-yellow-50/30 dark:bg-yellow-950/10 px-1',
          showExpiredApproval && 'rounded-lg border border-border bg-muted/20 px-1',
        )}
      >
        <InlineToolCall
          id={id}
          label={name}
          status={inlineStatus}
          kind={kind}
          iconStyle="badge"
          iconLetter={iconLetter}
          argSummary={durationLabel}
          errorMessage={status === 'error' ? error : undefined}
          body={body}
          defaultOpen={showApprovalPrompt || showExpiredApproval}
        />

        {(canCancel || showCopyAction) && (
          <div
            className={cn(
              'pointer-events-none absolute right-1 top-1 flex items-center gap-1.5',
              'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto',
              canCancel && 'opacity-100 pointer-events-auto',
            )}
          >
            {canCancel && (
              <button
                type="button"
                aria-label="Cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel!(id);
                }}
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
            {showCopyAction && (
              <button
                type="button"
                aria-label={copied ? 'Copied' : 'Copy'}
                onClick={handleCopy}
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {footer}
    </div>
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
