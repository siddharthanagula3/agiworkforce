import { useState } from 'react';
import {
  Clock,
  FileText,
  Terminal,
  FilePlus,
  Globe,
  Link,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';
import type { ThinkingBlock as ThinkingBlockType, ThinkingStep } from '../lib/types';

interface ThinkingBlockProps {
  block: ThinkingBlockType;
}

interface StepIconProps {
  type: ThinkingStep['type'];
}

function StepIcon({ type }: StepIconProps) {
  const cls = 'shrink-0 mt-0.5';
  switch (type) {
    case 'thinking':
      return <Clock size={13} className={cn(cls, 'text-[var(--chat-text-muted)]')} />;
    case 'reading':
      return <FileText size={13} className={cn(cls, 'text-[var(--chat-text-muted)]')} />;
    case 'script':
      return <Terminal size={13} className={cn(cls, 'text-[var(--chat-text-muted)]')} />;
    case 'creating':
      return <FilePlus size={13} className={cn(cls, 'text-[var(--chat-text-muted)]')} />;
    case 'search':
      return <Globe size={13} className={cn(cls, 'text-[var(--chat-text-muted)]')} />;
    case 'tool':
      return <Link size={13} className={cn(cls, 'text-[var(--chat-text-muted)]')} />;
    case 'done':
      return <CheckCircle2 size={13} className={cn(cls, 'text-[var(--chat-success)]')} />;
    default:
      return <Clock size={13} className={cn(cls, 'text-[var(--chat-text-muted)]')} />;
  }
}

interface StepResultProps {
  result: string;
}

function StepResult({ result }: StepResultProps) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="mt-1 ml-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1 text-[11px] text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] transition-colors"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        <span>{collapsed ? 'Show result' : 'Hide result'}</span>
      </button>
      {!collapsed && (
        <pre className="mt-1 rounded-[var(--chat-radius-sm)] bg-[var(--chat-surface-overlay)] px-3 py-2 text-[11px] font-mono text-[var(--chat-text-muted)] leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
          {result}
        </pre>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ThinkingBlock({ block }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(!block.collapsed);

  const isDone = block.steps.some((s) => s.type === 'done');
  const isRunning = !isDone;

  return (
    <div className="my-2 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2',
          'text-left text-[13px] font-medium text-[var(--chat-thinking-text)]',
          'bg-[var(--chat-surface-elevated)] hover:bg-[var(--chat-surface-hover)] transition-colors',
        )}
        aria-expanded={expanded}
      >
        <span className="truncate">{block.summary}</span>
        <div className="flex items-center gap-2 shrink-0">
          {block.durationMs !== undefined && (
            <span className="text-[11px] font-normal text-[var(--chat-text-muted)]">
              {formatDuration(block.durationMs)}
            </span>
          )}
          {isRunning && (
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--chat-accent-secondary)] animate-pulse"
            />
          )}
          {expanded ? (
            <ChevronDown size={13} className="text-[var(--chat-text-muted)]" />
          ) : (
            <ChevronRight size={13} className="text-[var(--chat-text-muted)]" />
          )}
        </div>
      </button>

      {/* Timeline */}
      {expanded && (
        <div className="relative px-3 py-2 bg-[var(--chat-surface-base)]">
          {/* Left border line */}
          <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-[var(--chat-thinking-line)]" />

          <div className="flex flex-col gap-2">
            {block.steps.map((step) => (
              <div key={step.id} className="relative pl-5">
                {/* Step row */}
                <div className="flex items-start gap-2">
                  {/* Icon sits on the timeline */}
                  <div className="absolute -left-0 flex items-center justify-center w-4 h-4 rounded-full bg-[var(--chat-surface-elevated)] border border-[var(--chat-border)]">
                    <StepIcon type={step.type} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-[13px] leading-relaxed break-words',
                        step.type === 'done'
                          ? 'text-[var(--chat-success)]'
                          : 'text-[var(--chat-thinking-text)]',
                      )}
                    >
                      {step.content}
                    </p>

                    {/* Badge pill */}
                    {step.badgeType && (
                      <div className="mt-1">
                        {step.badgeType === 'result' && <Badge variant="result">[Result]</Badge>}
                        {step.badgeType === 'script' && <Badge variant="script">[Script]</Badge>}
                        {step.badgeType === 'file' && (
                          <Badge variant="file">{step.badge ?? '[File]'}</Badge>
                        )}
                      </div>
                    )}

                    {/* Collapsible result content */}
                    {step.result && <StepResult result={step.result} />}
                  </div>
                </div>
              </div>
            ))}

            {/* Running pulse indicator when block is not finished */}
            {isRunning && (
              <div className="relative pl-5">
                <div className="absolute -left-0 flex items-center justify-center w-4 h-4">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full bg-[var(--chat-accent-secondary)] animate-pulse"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
