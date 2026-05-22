// apps/desktop/src/features/chat/ToolCallCard.tsx
//
// Desktop chat ToolCallCard — refactored to render via the shared
// @agiworkforce/unified-chat InlineToolCall with `iconStyle="badge"`,
// matching Claude's visual pattern (round badge + "Result" sub-label).
//
// External API is preserved so TaskPhaseTimeline and other callers compile.

import { useState, useEffect, useRef } from 'react';
import { InlineToolCall, type InlineToolKind } from '@agiworkforce/unified-chat';
import { cn } from '../../lib/utils';

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

interface ToolCallCardProps {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  status: ToolCallStatus;
  elapsedMs?: number;
  startedAt?: number;
  className?: string;
}

/** Browser-related display names that indicate browser automation actions. */
const BROWSER_DISPLAY_NAMES = new Set([
  'open website',
  'click',
  'clicking',
  'type text',
  'typing',
  'take screenshot',
  'scroll page',
  'browsing',
  'autofill application',
  'get url',
  'get page title',
  'go back',
  'go forward',
  'reload page',
  'run javascript',
  'wait for element',
  'select option',
  'hover',
  'fill input',
]);

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Map our local ToolCallStatus → InlineToolCallStatus */
function toInlineStatus(status: ToolCallStatus): 'pending' | 'running' | 'success' | 'error' {
  switch (status) {
    case 'running':
      return 'running';
    case 'complete':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

/** Derive InlineToolKind from tool name heuristics */
function toInlineKind(toolName: string): InlineToolKind {
  const n = toolName.toLowerCase();
  if (n.startsWith('mcp__') || n.startsWith('mcp_')) return 'mcp-custom';
  if (BROWSER_DISPLAY_NAMES.has(n)) return 'browser';
  if (n.includes('bash') || n.includes('shell') || n.includes('exec') || n.includes('terminal'))
    return 'bash';
  if (n.includes('search') && !n.includes('fetch')) return 'web-search';
  if (n.includes('fetch') || n.includes('http')) return 'web-fetch';
  if (n.includes('edit') || n.includes('patch')) return 'edit';
  if (n.includes('write') || n.includes('create') || n.includes('new')) return 'write';
  if (n.includes('read') || n.includes('view') || n.includes('list') || n.includes('directory'))
    return 'read';
  if (n.includes('image') || n.includes('imagegen')) return 'image-gen';
  if (n.includes('click') || n.includes('screenshot')) return 'browser';
  return 'unknown';
}

/** Build the expanded body node for InlineToolCall */
function buildBody(
  args: Record<string, unknown> | undefined,
  result: string | undefined,
  error: string | undefined,
  status: ToolCallStatus,
): React.ReactNode | undefined {
  const hasRequest = args && Object.keys(args).length > 0;
  const responseContent = status === 'error' ? error : result;
  const hasResponse = Boolean(responseContent);
  if (!hasRequest && !hasResponse) return undefined;

  return (
    <div className="space-y-2">
      {hasRequest && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Request
          </p>
          <pre className="font-mono text-[10px] leading-snug p-2 rounded bg-black/40 border border-white/8 overflow-x-auto max-h-48 overflow-y-auto select-text">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>
      )}
      {hasResponse && responseContent && (
        <div>
          <p
            className={cn(
              'text-[10px] font-medium uppercase tracking-wide mb-1',
              status === 'error' ? 'text-red-400' : 'text-muted-foreground',
            )}
          >
            Response
          </p>
          <pre className="font-mono text-[10px] leading-snug p-2 rounded bg-black/40 border border-white/8 overflow-x-auto max-h-48 overflow-y-auto select-text text-foreground/80">
            {responseContent}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ToolCallCard({
  toolCallId,
  toolName,
  args,
  result,
  error,
  status,
  elapsedMs,
  startedAt,
  className,
}: ToolCallCardProps) {
  const [liveElapsed, setLiveElapsed] = useState<number>(0);
  const timerStartRef = useRef<number>(startedAt ?? Date.now());

  useEffect(() => {
    if (status !== 'running' || startedAt == null) return;
    timerStartRef.current = startedAt;
    const tick = () => setLiveElapsed(Date.now() - timerStartRef.current);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [status, startedAt]);

  const displayDuration =
    status === 'running' && startedAt
      ? formatDuration(liveElapsed)
      : elapsedMs != null
        ? formatDuration(elapsedMs)
        : undefined;

  const inlineStatus = toInlineStatus(status);
  const inlineKind = toInlineKind(toolName);
  const body = buildBody(args, result, error, status);

  return (
    <InlineToolCall
      id={toolCallId}
      label={toolName}
      status={inlineStatus}
      kind={inlineKind}
      iconStyle="badge"
      argSummary={displayDuration}
      body={body}
      className={className}
    />
  );
}
