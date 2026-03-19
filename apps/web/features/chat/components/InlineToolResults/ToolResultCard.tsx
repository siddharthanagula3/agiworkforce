'use client';

/**
 * ToolResultCard
 *
 * Generic fallback renderer for tool results that do not have a specialized
 * inline renderer. Displays the raw data as formatted JSON with:
 * - Tool name header
 * - Expand/collapse for large payloads
 * - Copy-to-clipboard
 * - Error state rendering
 */

import { useState } from 'react';
import { Wrench, Copy, Check, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ToolResultProps } from './index';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MAX_PREVIEW_CHARS = 300;

export const ToolResultCard: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Running state
  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <span className="text-sm text-muted-foreground">Processing...</span>
      </div>
    );
  }

  // Error state
  if (status === 'error' || status === 'failed') {
    return (
      <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Tool execution failed</p>
            {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!result?.data) return null;

  // Serialize data
  let serialized: string;
  try {
    serialized =
      typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
  } catch {
    serialized = String(result.data);
  }

  const isLong = serialized.length > MAX_PREVIEW_CHARS;
  const displayText = expanded || !isLong ? serialized : serialized.slice(0, MAX_PREVIEW_CHARS);

  const handleCopy = () => {
    void navigator.clipboard.writeText(serialized);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 rounded-lg border border-border/50 overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Tool Result</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy result"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={cn('px-3 py-2 max-h-64 overflow-auto')}>
        <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
          {displayText}
          {isLong && !expanded && <span className="text-muted-foreground/50">...</span>}
        </pre>

        {isLong && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Show full result ({Math.ceil(serialized.length / 1024)}KB)
          </button>
        )}
      </div>
    </div>
  );
};
