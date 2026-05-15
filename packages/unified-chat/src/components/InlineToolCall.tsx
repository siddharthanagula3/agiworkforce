// packages/unified-chat/src/components/InlineToolCall.tsx
//
// Shared inline tool-call UI for desktop + web. Locked anatomy from
// docs/design/design-spec-2026-05-15.md §4:
//   - borderless flex-row bar (32px tall, no border, no fill on collapsed state)
//   - leading 16px Lucide icon at strokeWidth=1.75
//   - label text at --text-base, arg summary muted + ellipsis-truncated at 360px
//   - trailing chevron 14px (rotates 90deg when open)
//   - expanded body: --bg-code bg, 1px --border-subtle border, 8px radius, 16px pad
//   - states: pending / running / success / error / partial
//   - multi-step sequences stack with a 1px left guideline (InlineToolCallStack)
//
// All icons are Lucide React per design-spec §4.6 + §5.

import {
  useState,
  useCallback,
  type KeyboardEvent,
  type ReactNode,
  type ComponentType,
} from 'react';
import {
  ChevronRight,
  Loader2,
  Terminal,
  FileText,
  FilePen,
  FilePlus2,
  Search,
  Globe,
  Folder,
  Image as ImageIcon,
  MousePointerClick,
  Plug,
  CircleCheck,
  CircleAlert,
  CircleSlash,
  Brain,
  Wrench,
  type LucideProps,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InlineToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'partial';

/**
 * Canonical tool category keys. Drive both icon mapping (§4.6) and any
 * future per-tool body renderers (§4.5). Callers can also pass `'auto'`
 * to derive from `toolName` heuristics.
 */
export type InlineToolKind =
  | 'auto'
  | 'bash'
  | 'read'
  | 'write'
  | 'edit'
  | 'web-search'
  | 'web-fetch'
  | 'fs-list'
  | 'image-gen'
  | 'browser'
  | 'mcp-custom'
  | 'thinking'
  | 'done'
  | 'unknown';

export interface InlineToolCallProps {
  /** Stable id used for aria-controls + test selection. */
  id: string;
  /** Human-readable tool label rendered next to the icon. */
  label: string;
  /** Optional arg summary rendered next to label (muted, ellipsis). */
  argSummary?: string;
  /** Lifecycle state. Drives icon, label suffix, and color. */
  status: InlineToolCallStatus;
  /** Canonical tool kind; defaults to `'auto'` which derives from `label`. */
  kind?: InlineToolKind;
  /**
   * Expanded body content. Caller decides the renderer per-tool (e.g.
   * `<pre>` for bash, syntax-highlighted code for read, diff for write).
   * If omitted the bar is not expandable.
   */
  body?: ReactNode;
  /** Short error message rendered as label suffix when `status === 'error'`. */
  errorMessage?: string;
  /** Controlled-mode: caller decides open/closed state. */
  open?: boolean;
  /** Controlled-mode callback. */
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled-mode initial open state. */
  defaultOpen?: boolean;
  className?: string;
  /** Override icon mapping. Receives the resolved Lucide icon props. */
  iconOverride?: ComponentType<LucideProps>;
}

// ─── Icon mapping (§4.6) ──────────────────────────────────────────────────────

const ICON_BY_KIND: Record<Exclude<InlineToolKind, 'auto'>, ComponentType<LucideProps>> = {
  bash: Terminal,
  read: FileText,
  write: FilePlus2,
  edit: FilePen,
  'web-search': Search,
  'web-fetch': Globe,
  'fs-list': Folder,
  'image-gen': ImageIcon,
  browser: MousePointerClick,
  'mcp-custom': Plug,
  thinking: Brain,
  done: CircleCheck,
  unknown: Wrench,
};

/** Heuristic mapping when `kind === 'auto'`. Matches by lowercase substring. */
export function inferKindFromLabel(label: string): Exclude<InlineToolKind, 'auto'> {
  const l = label.toLowerCase();
  if (l.includes('mcp__') || l.includes('mcp_') || l.includes('mcp ') || l.startsWith('mcp')) {
    return 'mcp-custom';
  }
  if (l.includes('bash') || l.includes('terminal') || l.includes('shell') || l.includes('exec')) {
    return 'bash';
  }
  if (l.includes('search') && !l.includes('fetch')) return 'web-search';
  if (l.includes('fetch') || l.includes('browse') || l.includes('http') || l.includes('url')) {
    return 'web-fetch';
  }
  if (l.includes('click') || l.includes('screenshot') || l.includes('typing')) return 'browser';
  if (l.includes('list') && (l.includes('dir') || l.includes('folder'))) return 'fs-list';
  if (l.includes('image') || l.includes('image_gen') || l.includes('imagegen')) return 'image-gen';
  if (l.includes('thinking') || l.includes('reason')) return 'thinking';
  if (l.includes('edit') || l.includes('patch')) return 'edit';
  if (l.includes('write') || l.includes('create')) return 'write';
  if (l.includes('read') || l.includes('view') || l.includes('file')) return 'read';
  return 'unknown';
}

function resolveIcon(
  kind: InlineToolKind,
  label: string,
  override?: ComponentType<LucideProps>,
): ComponentType<LucideProps> {
  if (override) return override;
  const resolved = kind === 'auto' ? inferKindFromLabel(label) : kind;
  return ICON_BY_KIND[resolved] ?? Wrench;
}

// ─── Status decoration ────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: InlineToolCallStatus }) {
  if (status === 'pending' || status === 'running') {
    return (
      <Loader2
        size={14}
        strokeWidth={2}
        className="inline-tool-call__spinner animate-spin text-[color:var(--text-muted)]"
        aria-hidden="true"
      />
    );
  }
  if (status === 'error') {
    return (
      <CircleAlert
        size={14}
        strokeWidth={2}
        className="text-[color:var(--state-danger,#ef4444)]"
        aria-hidden="true"
      />
    );
  }
  if (status === 'partial') {
    return (
      <CircleSlash
        size={14}
        strokeWidth={2}
        className="text-[color:var(--state-warning,#f59e0b)]"
        aria-hidden="true"
      />
    );
  }
  // success: silent — no trailing indicator (per spec §4.4)
  return null;
}

/** Label suffix per state (§4.4). */
function labelSuffix(status: InlineToolCallStatus, errorMessage?: string): string {
  switch (status) {
    case 'pending':
      return '…';
    case 'running':
      return 'Running';
    case 'error':
      return errorMessage ? `Error: ${errorMessage}` : 'Error';
    case 'partial':
      return 'Partial — see body';
    case 'success':
    default:
      return '';
  }
}

function colorClassForStatus(status: InlineToolCallStatus): string {
  switch (status) {
    case 'error':
      return 'text-[color:var(--state-danger,#ef4444)]';
    case 'partial':
      return 'text-[color:var(--state-warning,#f59e0b)]';
    case 'pending':
      return 'text-[color:var(--text-muted)]';
    case 'running':
    case 'success':
    default:
      return 'text-[color:var(--text-secondary,inherit)]';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InlineToolCall({
  id,
  label,
  argSummary,
  status,
  kind = 'auto',
  body,
  errorMessage,
  open,
  onOpenChange,
  defaultOpen = false,
  className,
  iconOverride,
}: InlineToolCallProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
  const effectiveOpen = isControlled ? !!open : internalOpen;
  const isExpandable = body !== undefined && body !== null;

  const toggle = useCallback(() => {
    if (!isExpandable) return;
    const next = !effectiveOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [isExpandable, effectiveOpen, isControlled, onOpenChange]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isExpandable) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [isExpandable, toggle],
  );

  const Icon = resolveIcon(kind, label, iconOverride);
  const bodyId = `${id}-body`;
  const suffix = labelSuffix(status, errorMessage);
  const colorClass = colorClassForStatus(status);

  return (
    <div
      className={cn(
        'inline-tool-call flex flex-col gap-1',
        effectiveOpen && 'inline-tool-call--open',
        className,
      )}
      data-tool-id={id}
      data-status={status}
    >
      <div
        role={isExpandable ? 'button' : undefined}
        tabIndex={isExpandable ? 0 : undefined}
        aria-expanded={isExpandable ? effectiveOpen : undefined}
        aria-controls={isExpandable ? bodyId : undefined}
        aria-label={`${label}${suffix ? ` — ${suffix}` : ''}`}
        onClick={isExpandable ? toggle : undefined}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-tool-call__bar flex items-center gap-2 select-none',
          'h-8 px-1 rounded-md',
          isExpandable && 'cursor-pointer hover:bg-[color:var(--bg-hover,rgba(0,0,0,0.04))]',
          'transition-colors duration-100',
        )}
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          className="inline-tool-call__icon shrink-0 text-[color:var(--text-muted)]"
          aria-hidden="true"
        />
        <span className={cn('inline-tool-call__label text-sm font-normal shrink-0', colorClass)}>
          {label}
        </span>
        {argSummary ? (
          <span
            className={cn(
              'inline-tool-call__summary text-xs text-[color:var(--text-muted)]',
              'whitespace-nowrap overflow-hidden text-ellipsis',
              'max-w-[360px] min-w-0 flex-1',
            )}
            title={argSummary}
          >
            {argSummary}
          </span>
        ) : (
          <span className="flex-1 min-w-0" aria-hidden="true" />
        )}
        {suffix ? (
          <span className={cn('inline-tool-call__suffix text-xs shrink-0', colorClass)}>
            {suffix}
          </span>
        ) : null}
        <StatusIndicator status={status} />
        {isExpandable ? (
          <ChevronRight
            size={14}
            strokeWidth={2}
            className={cn(
              'inline-tool-call__chevron shrink-0 text-[color:var(--text-muted)]',
              'transition-transform duration-150',
              effectiveOpen && 'rotate-90',
            )}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {isExpandable && effectiveOpen ? (
        <div
          id={bodyId}
          role="region"
          aria-label={`${label} details`}
          className={cn(
            'inline-tool-call__body',
            'bg-[color:var(--bg-code,rgba(0,0,0,0.04))]',
            'border border-[color:var(--border-subtle,rgba(0,0,0,0.08))]',
            'rounded-lg p-4',
            'text-sm font-mono leading-5 text-[color:var(--text-primary,inherit)]',
            'overflow-x-auto max-h-[480px] overflow-y-auto',
          )}
        >
          {body}
        </div>
      ) : null}
    </div>
  );
}

// ─── Multi-step stack (§4.2 — 1px left guideline) ─────────────────────────────

export interface InlineToolCallStackProps {
  children: ReactNode;
  className?: string;
}

export function InlineToolCallStack({ children, className }: InlineToolCallStackProps) {
  return (
    <div
      className={cn(
        'inline-tool-call-stack flex flex-col gap-2 ml-2 pl-3',
        'border-l border-[color:var(--border-subtle,rgba(0,0,0,0.08))]',
        className,
      )}
      data-tool-stack=""
    >
      {children}
    </div>
  );
}
