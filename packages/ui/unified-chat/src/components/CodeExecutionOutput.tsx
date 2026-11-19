import { AgiMark } from '@agiworkforce/ui';
import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Code2, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { safeExecutionImageSrc, type CodeExecutionResult } from '../lib/code-execution-result';

export {
  hasRunningCodeExecutionTool,
  isExecutingCode,
  readCodeExecutionResult,
  safeExecutionImageSrc,
  type CodeExecutionImage,
  type CodeExecutionMessage,
  type CodeExecutionResult,
} from '../lib/code-execution-result';

export interface CodeExecutionOutputProps {
  isExecuting?: boolean;
  result?: CodeExecutionResult;
}

export function CodeExecutionOutput({ isExecuting, result }: CodeExecutionOutputProps) {
  const [expanded, setExpanded] = useState(true);

  if (!isExecuting && !result) return null;

  const safeImages =
    result?.images?.flatMap((image) => {
      const src = safeExecutionImageSrc(image);
      return src ? [{ src }] : [];
    }) ?? [];
  const hasOutput = Boolean(result && (result.stdout || result.stderr || safeImages.length > 0));
  const succeeded = result?.returnCode === 0;
  const statusAnnouncement = isExecuting
    ? 'Running code…'
    : succeeded
      ? 'Code execution succeeded'
      : result
        ? 'Code execution failed'
        : null;

  return (
    <div
      data-testid="code-execution-output"
      className="mt-2 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] text-sm"
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </span>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start hover:bg-[var(--chat-surface-hover)]"
      >
        <Code2 className="h-4 w-4 shrink-0 text-[var(--chat-accent-primary-text)]" aria-hidden />
        <span className="flex-1 font-medium text-[var(--chat-text-primary)]">Code execution</span>
        {isExecuting ? (
          <AgiMark
            spinning
            className="h-3.5 w-3.5 text-[var(--chat-accent-primary-text)]"
            aria-hidden
          />
        ) : succeeded ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success-text" aria-hidden />
        ) : result ? (
          <XCircle className="h-3.5 w-3.5 text-danger-text" aria-hidden />
        ) : null}
        {hasOutput ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--chat-text-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--chat-text-muted)]" aria-hidden />
          )
        ) : null}
      </button>

      {isExecuting ? (
        <p className="px-3 pb-2 text-xs text-[var(--chat-text-muted)]">Running code…</p>
      ) : null}

      {expanded && result && hasOutput ? (
        <div className="space-y-2 border-t border-[var(--chat-border)] px-3 pt-2 pb-3">
          {result.stdout ? (
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--chat-text-muted)]">Output</p>
              <pre
                data-testid="code-execution-stdout"
                className={cn(
                  'max-h-64 overflow-x-auto overflow-y-auto rounded-sm',
                  'bg-[var(--chat-surface-overlay)] px-3 py-2 font-mono text-xs leading-relaxed',
                  'whitespace-pre-wrap break-words text-[var(--chat-text-primary)]',
                )}
              >
                {result.stdout}
              </pre>
            </div>
          ) : null}

          {result.stderr ? (
            <div>
              <p className="mb-1 text-xs font-medium text-danger-text">Stderr</p>
              <pre
                data-testid="code-execution-stderr"
                className={cn(
                  'max-h-48 overflow-x-auto overflow-y-auto rounded-sm',
                  'border border-danger-fill/20 bg-danger-fill/5 px-3 py-2',
                  'font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-danger-text',
                )}
              >
                {result.stderr}
              </pre>
            </div>
          ) : null}

          {safeImages.map((image, index) => (
            <div key={image.src}>
              <p className="mb-1 text-xs font-medium text-[var(--chat-text-muted)]">
                Plot {index + 1}
              </p>
              <img
                src={image.src}
                alt={`Code execution output ${index + 1}`}
                className="max-w-full rounded-sm border border-[var(--chat-border)]"
              />
            </div>
          ))}

          {result.returnCode !== 0 ? (
            <p className="text-xs text-danger-text">Exit code: {result.returnCode}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
