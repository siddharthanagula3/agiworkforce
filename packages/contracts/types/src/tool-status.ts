export const TOOL_STATUSES = [
  'pending',
  'awaiting-approval',
  'running',
  'succeeded',
  'partial',
  'canceled',
  'failed',
] as const;

export type ToolStatus = (typeof TOOL_STATUSES)[number];

export type ToolStatusTone = 'neutral' | 'active' | 'success' | 'warning' | 'error';

export interface ToolStatusPresentation {
  readonly label: string;
  readonly tone: ToolStatusTone;
  readonly terminal: boolean;
}

export const TOOL_STATUS_PRESENTATION: Readonly<Record<ToolStatus, ToolStatusPresentation>> =
  Object.freeze({
    pending: { label: 'Queued', tone: 'neutral', terminal: false },
    'awaiting-approval': { label: 'Needs approval', tone: 'warning', terminal: false },
    running: { label: 'Running', tone: 'active', terminal: false },
    succeeded: { label: 'Done', tone: 'success', terminal: true },
    partial: { label: 'Partial result', tone: 'warning', terminal: true },
    canceled: { label: 'Canceled', tone: 'neutral', terminal: true },
    failed: { label: 'Failed', tone: 'error', terminal: true },
  } as const);

const WIRE_TOOL_STATUS: Readonly<Record<string, ToolStatus>> = Object.freeze({
  queued: 'pending',
  created: 'pending',
  pending: 'pending',
  awaiting_approval: 'awaiting-approval',
  requires_approval: 'awaiting-approval',
  needs_approval: 'awaiting-approval',
  running: 'running',
  in_progress: 'running',
  streaming: 'running',
  searching: 'running',
  executing: 'running',
  succeeded: 'succeeded',
  success: 'succeeded',
  completed: 'succeeded',
  complete: 'succeeded',
  done: 'succeeded',
  ok: 'succeeded',
  partial: 'partial',
  partial_success: 'partial',
  incomplete: 'partial',
  truncated: 'partial',
  max_tokens: 'partial',
  canceled: 'canceled',
  cancelled: 'canceled',
  aborted: 'canceled',
  interrupted: 'canceled',
  stopped: 'canceled',
  failed: 'failed',
  failure: 'failed',
  error: 'failed',
  errored: 'failed',
  timeout: 'failed',
  timed_out: 'failed',
  denied: 'failed',
  rejected: 'failed',
} as const);

export function isToolStatus(value: unknown): value is ToolStatus {
  return typeof value === 'string' && (TOOL_STATUSES as readonly string[]).includes(value);
}

export function normalizeToolStatus(raw: unknown, fallback: ToolStatus = 'running'): ToolStatus {
  if (isToolStatus(raw)) return raw;
  if (typeof raw !== 'string') return fallback;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return WIRE_TOOL_STATUS[key] ?? fallback;
}

export function isTerminalToolStatus(status: ToolStatus): boolean {
  return TOOL_STATUS_PRESENTATION[status].terminal;
}
