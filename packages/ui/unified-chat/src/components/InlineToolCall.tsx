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
  BookOpen,
  Wrench,
  Clock,
  type LucideProps,
} from 'lucide-react';
import { cn } from '../lib/utils';

export type InlineToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'partial';

export type InlineToolIconStyle = 'lucide' | 'badge';

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
  | 'skill'
  | 'thinking'
  | 'done'
  | 'unknown';

export interface InlineToolCallProps {
  id: string;
  label: string;
  argSummary?: string;
  status: InlineToolCallStatus;
  kind?: InlineToolKind;
  body?: ReactNode;
  errorMessage?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
  iconOverride?: ComponentType<LucideProps>;
  iconStyle?: InlineToolIconStyle;
  iconLetter?: string;
  resultLabel?: string;
}

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
  skill: BookOpen,
  thinking: Brain,
  done: CircleCheck,
  unknown: Wrench,
};

type BadgeGlyph = { kind: 'glyph'; Icon: ComponentType<LucideProps> };
type BadgeLetter = { kind: 'letter'; letter: string };
type BadgeCheck = { kind: 'check' };
export type BadgeConfig = BadgeGlyph | BadgeLetter | BadgeCheck;

export const KIND_TO_BADGE: Record<Exclude<InlineToolKind, 'auto'>, BadgeConfig> = {
  bash: { kind: 'letter', letter: '>' },
  read: { kind: 'letter', letter: 'F' },
  write: { kind: 'letter', letter: 'F' },
  edit: { kind: 'letter', letter: 'F' },
  'fs-list': { kind: 'letter', letter: 'F' },
  'web-search': { kind: 'glyph', Icon: Search },
  'web-fetch': { kind: 'letter', letter: 'W' },
  'image-gen': { kind: 'letter', letter: 'I' },
  browser: { kind: 'letter', letter: 'B' },
  'mcp-custom': { kind: 'letter', letter: 'M' },
  skill: { kind: 'glyph', Icon: BookOpen },
  thinking: { kind: 'glyph', Icon: Clock },
  done: { kind: 'check' },
  unknown: { kind: 'letter', letter: '?' },
};

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
  if (l.includes('skill')) return 'skill';
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

function resolveBadgeConfig(kind: InlineToolKind, label: string, iconLetter?: string): BadgeConfig {
  const resolved = kind === 'auto' ? inferKindFromLabel(label) : kind;
  if (iconLetter) return { kind: 'letter', letter: iconLetter };
  return KIND_TO_BADGE[resolved] ?? { kind: 'letter', letter: '?' };
}

function BadgeIcon({ config }: { config: BadgeConfig }) {
  if (config.kind === 'check') {
    return (
      <span
        className="inline-tool-call__badge inline-flex items-center justify-center w-6 h-6 rounded-full bg-transparent"
        aria-hidden="true"
        data-badge-kind="check"
      >
        <CircleCheck
          size={16}
          strokeWidth={2}
          className="text-[color:var(--chat-success,#16a34a)]"
        />
      </span>
    );
  }
  if (config.kind === 'glyph') {
    const Icon = config.Icon;
    return (
      <span
        className="inline-tool-call__badge inline-flex items-center justify-center w-6 h-6 rounded-full bg-[color:var(--chat-surface-elevated,rgba(26,25,21,0.06))]"
        aria-hidden="true"
        data-badge-kind="glyph"
      >
        <Icon size={11} strokeWidth={2} className="text-[color:var(--chat-text-muted,#8b8680)]" />
      </span>
    );
  }
  return (
    <span
      className="inline-tool-call__badge inline-flex items-center justify-center w-6 h-6 rounded-full bg-[color:var(--chat-surface-elevated,rgba(26,25,21,0.06))] text-[color:var(--chat-text-muted,#8b8680)] text-[12px] font-semibold select-none"
      aria-hidden="true"
      data-badge-kind="letter"
      data-badge-letter={config.letter}
    >
      {config.letter}
    </span>
  );
}

function StatusIndicator({ status }: { status: InlineToolCallStatus }) {
  if (status === 'pending' || status === 'running') {
    return (
      <Loader2
        size={14}
        strokeWidth={2}
        className="inline-tool-call__spinner animate-spin text-[color:var(--chat-text-muted,#8b8680)]"
        aria-hidden="true"
      />
    );
  }
  if (status === 'error') {
    return (
      <CircleAlert
        size={14}
        strokeWidth={2}
        className="text-[color:var(--chat-destructive-text)]"
        aria-hidden="true"
      />
    );
  }
  if (status === 'partial') {
    return (
      <CircleSlash
        size={14}
        strokeWidth={2}
        className="text-[color:var(--chat-warning-fg)]"
        aria-hidden="true"
      />
    );
  }
  return null;
}

function labelSuffix(status: InlineToolCallStatus, errorMessage?: string): string {
  switch (status) {
    case 'pending':
      return '…';
    case 'running':
      return 'Running';
    case 'error':
      return errorMessage ? `Error: ${errorMessage}` : 'Error';
    case 'partial':
      return 'Partial, see body';
    case 'success':
    default:
      return '';
  }
}

function colorClassForStatus(status: InlineToolCallStatus): string {
  switch (status) {
    case 'error':
      return 'text-[color:var(--chat-destructive-text)]';
    case 'partial':
      return 'text-[color:var(--chat-warning-fg)]';
    case 'pending':
      return 'text-[color:var(--chat-text-muted,#8b8680)]';
    case 'running':
    case 'success':
    default:
      return 'text-[color:var(--chat-text-secondary,inherit)]';
  }
}

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
  iconStyle = 'lucide',
  iconLetter,
  resultLabel = 'Result',
}: InlineToolCallProps) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(defaultOpen);
  const effectiveOpen = isControlled ? !!open : internalOpen;
  const isExpandable = body !== undefined && body !== null;
  const isBadge = iconStyle === 'badge';

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

  const bodyId = `${id}-body`;
  const suffix = labelSuffix(status, errorMessage);
  const colorClass = colorClassForStatus(status);

  if (isBadge) {
    const badgeConfig = resolveBadgeConfig(kind, label, iconLetter);
    const showResultLabel = status === 'success' && !body;

    return (
      <div
        className={cn(
          'inline-tool-call inline-tool-call--badge flex flex-col',
          effectiveOpen && 'inline-tool-call--open',
          className,
        )}
        data-tool-id={id}
        data-status={status}
        data-icon-style="badge"
      >
        <div
          role={isExpandable ? 'button' : undefined}
          tabIndex={isExpandable ? 0 : undefined}
          aria-expanded={isExpandable ? effectiveOpen : undefined}
          aria-controls={isExpandable ? bodyId : undefined}
          aria-label={`${label}${suffix ? `, ${suffix}` : ''}`}
          onClick={isExpandable ? toggle : undefined}
          onKeyDown={onKeyDown}
          className={cn(
            'inline-tool-call__bar flex items-center gap-2 select-none',
            status === 'error' ? 'min-h-7 py-1' : 'h-7',
            'px-1 rounded-md',
            isExpandable &&
              'cursor-pointer hover:bg-[color:var(--chat-surface-hover,rgba(26,25,21,0.04))]',
            'transition-colors duration-100',
          )}
        >
          <BadgeIcon config={badgeConfig} />
          {/* Tool names are arbitrary-length, MCP servers namespace them
              ("mcp__filesystem__read_text_file"). shrink-0 with no ellipsis made
              the label hold its full intrinsic width and push the status dot and
              chevron off the row's right edge. An error label is a full status
              sentence, not a name: it wraps instead, since an ellipsis mid-word
              (or mid-sentence) leaves the user unable to read what happened. */}
          <span
            className={cn(
              'inline-tool-call__label min-w-0 text-sm font-normal',
              status === 'error' ? 'flex-1 whitespace-normal break-words' : 'truncate',
              colorClass,
            )}
            title={typeof label === 'string' ? label : undefined}
          >
            {label}
          </span>
          {argSummary ? (
            <span
              className={cn(
                'inline-tool-call__summary text-xs text-[color:var(--chat-text-muted,#8b8680)]',
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
                'inline-tool-call__chevron shrink-0 text-[color:var(--chat-text-muted,#8b8680)]',
                'transition-transform duration-150',
                effectiveOpen && 'rotate-90',
              )}
              aria-hidden="true"
            />
          ) : null}
        </div>

        {/* "Result" sub-label below the bar in badge mode (Claude parity) */}
        {showResultLabel ? (
          <span
            className="inline-tool-call__result-label ml-8 text-[12px] font-mono text-[color:var(--chat-text-muted,#8b8680)] leading-4"
            data-result-label=""
          >
            {resultLabel}
          </span>
        ) : null}

        {isExpandable && effectiveOpen ? (
          <div
            id={bodyId}
            role="region"
            aria-label={`${label} details`}
            className={cn(
              'inline-tool-call__body',
              'bg-[color:var(--chat-code-bg,rgba(0,0,0,0.04))]',
              'border border-[color:var(--chat-border-subtle,rgba(26,25,21,0.08))]',
              'rounded-lg p-4',
              'text-sm font-mono leading-5 text-[color:var(--chat-text-primary,inherit)]',
              'overflow-x-auto max-h-[480px] overflow-y-auto',
            )}
          >
            {body}
          </div>
        ) : null}
      </div>
    );
  }

  const Icon = resolveIcon(kind, label, iconOverride);

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
        aria-label={`${label}${suffix ? `, ${suffix}` : ''}`}
        onClick={isExpandable ? toggle : undefined}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-tool-call__bar flex items-center gap-2 select-none',
          'h-8 px-1 rounded-md',
          isExpandable &&
            'cursor-pointer hover:bg-[color:var(--chat-surface-hover,rgba(26,25,21,0.04))]',
          'transition-colors duration-100',
        )}
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          className="inline-tool-call__icon shrink-0 text-[color:var(--chat-text-muted,#8b8680)]"
          aria-hidden="true"
        />
        <span className={cn('inline-tool-call__label text-sm font-normal shrink-0', colorClass)}>
          {label}
        </span>
        {argSummary ? (
          <span
            className={cn(
              'inline-tool-call__summary text-xs text-[color:var(--chat-text-muted,#8b8680)]',
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
              'inline-tool-call__chevron shrink-0 text-[color:var(--chat-text-muted,#8b8680)]',
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
            'bg-[color:var(--chat-code-bg,rgba(0,0,0,0.04))]',
            'border border-[color:var(--chat-border-subtle,rgba(26,25,21,0.08))]',
            'rounded-lg p-4',
            'text-sm font-mono leading-5 text-[color:var(--chat-text-primary,inherit)]',
            'overflow-x-auto max-h-[480px] overflow-y-auto',
          )}
        >
          {body}
        </div>
      ) : null}
    </div>
  );
}

export interface InlineToolCallStackProps {
  children: ReactNode;
  className?: string;
}

export function InlineToolCallStack({ children, className }: InlineToolCallStackProps) {
  return (
    <div
      className={cn(
        'inline-tool-call-stack flex flex-col gap-2 ml-2 pl-3',
        'border-l border-[color:var(--chat-border-subtle,rgba(26,25,21,0.08))]',
        className,
      )}
      data-tool-stack=""
    >
      {children}
    </div>
  );
}
