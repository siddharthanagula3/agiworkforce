'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Code2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  returnCode: number;
  images?: Array<{ mediaType: string; data: string }>;
}

interface CodeExecutionBlockProps {
  isExecuting?: boolean;
  result?: CodeExecutionResult;
}

export function CodeExecutionBlock({ isExecuting, result }: CodeExecutionBlockProps) {
  const [expanded, setExpanded] = useState(true);

  if (!isExecuting && !result) return null;

  const hasOutput = result && (result.stdout || result.stderr || (result.images?.length ?? 0) > 0);
  const success = result && result.returnCode === 0;

  return (
    <div className="my-2 rounded-lg border border-border/60 bg-muted/20 text-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 rounded-lg transition-colors"
        aria-expanded={expanded}
      >
        <Code2 className="h-4 w-4 shrink-0 text-violet-400" />
        <span className="font-medium text-foreground/80 flex-1">Code Execution</span>
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
        ) : success ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : result ? (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        ) : null}
        {hasOutput ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )
        ) : null}
      </button>

      {/* Executing indicator */}
      {isExecuting && (
        <div className="px-3 pb-2 text-xs text-muted-foreground">Running Python…</div>
      )}

      {/* Output */}
      {expanded && result && hasOutput && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-2">
          {result.stdout && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
              <pre
                className={cn(
                  'rounded bg-background/60 px-3 py-2 text-xs font-mono leading-relaxed',
                  'overflow-x-auto whitespace-pre-wrap break-words text-foreground/90',
                  'max-h-64 overflow-y-auto',
                )}
              >
                {result.stdout}
              </pre>
            </div>
          )}

          {result.stderr && (
            <div>
              <p className="text-xs font-medium text-red-400 mb-1">Stderr</p>
              <pre
                className={cn(
                  'rounded bg-red-500/5 border border-red-500/20 px-3 py-2',
                  'text-xs font-mono leading-relaxed text-red-300',
                  'overflow-x-auto whitespace-pre-wrap break-words',
                  'max-h-48 overflow-y-auto',
                )}
              >
                {result.stderr}
              </pre>
            </div>
          )}

          {result.images?.map((img, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-muted-foreground mb-1">Plot {i + 1}</p>
              {/* Base64 plot output — not a navigable URL, raw img is intentional here */}
              <img
                src={`data:${img.mediaType};base64,${img.data}`}
                alt={`Code execution output ${i + 1}`}
                className="max-w-full rounded border border-border/40"
              />
            </div>
          ))}

          {result.returnCode !== 0 && (
            <p className="text-xs text-red-400">Exit code: {result.returnCode}</p>
          )}
        </div>
      )}
    </div>
  );
}
