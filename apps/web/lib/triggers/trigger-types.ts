import type { FieldCondition } from '@/lib/automation/field-conditions';

export const TRIGGER_SOURCES = [
  'gmail',
  'slack',
  'google_calendar',
  'github',
  'connector',
] as const;

export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export function isTriggerSource(value: unknown): value is TriggerSource {
  return (TRIGGER_SOURCES as readonly unknown[]).includes(value);
}

export const GITHUB_TRIGGER_EVENT_TYPES = [
  'push',
  'pull_request.opened',
  'pull_request.reopened',
  'pull_request.synchronize',
  'pull_request.ready_for_review',
  'pull_request.closed',
  'check_run.completed',
  'workflow_run.completed',
] as const;

export const GMAIL_TRIGGER_EVENT_TYPES = ['mailbox.changed'] as const;

export const GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES = ['events.changed', 'events.deleted'] as const;

const OPEN_EVENT_TYPE_RE: Record<'slack' | 'connector', RegExp> = {
  slack: /^[a-z][a-z0-9_]{0,63}$/,
  connector: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/,
};

const CLOSED_EVENT_TYPES: Record<'gmail' | 'google_calendar' | 'github', readonly string[]> = {
  gmail: GMAIL_TRIGGER_EVENT_TYPES,
  google_calendar: GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
  github: GITHUB_TRIGGER_EVENT_TYPES,
};

export const WILDCARD_EVENT_TYPE = '*';

export function isValidTriggerEventType(source: TriggerSource, value: string): boolean {
  if (value === WILDCARD_EVENT_TYPE) return true;
  if (source === 'slack' || source === 'connector') return OPEN_EVENT_TYPE_RE[source].test(value);
  const known = CLOSED_EVENT_TYPES[source];
  return known.includes(value) || known.some((type) => type.split('.')[0] === value);
}

export function eventTypeMatchCandidates(type: string): string[] {
  const family = type.split('.')[0] ?? type;
  return [...new Set([WILDCARD_EVENT_TYPE, type, family])];
}

export interface TriggerEvent {
  source: TriggerSource;
  type: string;
  deliveryId: string;
  account: string | null;
  triggerId: string | null;
  installationId: number | null;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface EventTrigger {
  id: string;
  userId: string;
  organizationId: string | null;
  taskId: string;
  name: string;
  source: TriggerSource;
  eventTypes: string[];
  sourceAccount: string | null;
  conditions: FieldCondition[];
  debounceSeconds: number;
  maxAttempts: number;
  isEnabled: boolean;
  verificationStatus: 'pending' | 'verified';
  verifiedAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TriggerEventOutcome =
  'received' | 'filtered' | 'debounced' | 'enqueued' | 'fired' | 'failed' | 'dead';

export interface EventTriggerDelivery {
  id: string;
  triggerId: string;
  source: TriggerSource;
  eventType: string;
  deliveryId: string;
  outcome: TriggerEventOutcome;
  detail: string | null;
  jobId: string | null;
  runId: string | null;
  receivedAt: string;
  updatedAt: string;
}
