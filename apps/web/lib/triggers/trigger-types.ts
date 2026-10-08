import {
  MANAGED_CLOUD_GITHUB_TRIGGER_EVENT_TYPES,
  MANAGED_CLOUD_GMAIL_TRIGGER_EVENT_TYPES,
  MANAGED_CLOUD_GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
  MANAGED_CLOUD_TRIGGER_DELIVERY_OUTCOMES,
  MANAGED_CLOUD_TRIGGER_SOURCES,
} from '@agiworkforce/cloud-contracts';
import {
  CONNECTOR_RELEASE_STATE,
  connectorsReleased,
  type ConnectorReleaseState,
} from '@agiworkforce/types';
import type { FieldCondition } from '@/lib/automation/field-conditions';

export const TRIGGER_SOURCES = MANAGED_CLOUD_TRIGGER_SOURCES;

export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export function isTriggerSource(value: unknown): value is TriggerSource {
  return (TRIGGER_SOURCES as readonly unknown[]).includes(value);
}

const CONNECTOR_BACKED_TRIGGER_SOURCES: ReadonlySet<TriggerSource> = new Set([
  'gmail',
  'google_calendar',
]);

export function triggerSourceAvailable(
  source: TriggerSource,
  connectorState: ConnectorReleaseState = CONNECTOR_RELEASE_STATE,
): boolean {
  return !CONNECTOR_BACKED_TRIGGER_SOURCES.has(source) || connectorsReleased(connectorState);
}

export const GITHUB_TRIGGER_EVENT_TYPES = MANAGED_CLOUD_GITHUB_TRIGGER_EVENT_TYPES;

export const GMAIL_TRIGGER_EVENT_TYPES = MANAGED_CLOUD_GMAIL_TRIGGER_EVENT_TYPES;

export const GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES =
  MANAGED_CLOUD_GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES;

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
  watchExpiresAt: string | null;
  watchError: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TriggerEventOutcome = (typeof MANAGED_CLOUD_TRIGGER_DELIVERY_OUTCOMES)[number];

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
