import {
  CONNECTOR_RELEASE_STATE,
  connectorsReleased,
  type ConnectorReleaseState,
} from '@agiworkforce/types';
import {
  MANAGED_CLOUD_GITHUB_TRIGGER_EVENT_TYPES,
  MANAGED_CLOUD_GMAIL_TRIGGER_EVENT_TYPES,
  MANAGED_CLOUD_GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
  type ManagedCloudEventTrigger,
  type ManagedCloudTriggerSource,
} from './triggers';

export interface ManagedCloudTriggerSourceOption {
  value: ManagedCloudTriggerSource;
  label: string;
  accountLabel: string | null;
  accountPlaceholder: string;
  eventTypes: readonly string[] | null;
  note: string;
}

export const MANAGED_CLOUD_TRIGGER_WILDCARD_EVENT_TYPE = '*';

export const MANAGED_CLOUD_TRIGGER_SOURCE_OPTIONS: readonly ManagedCloudTriggerSourceOption[] = [
  {
    value: 'github',
    label: 'GitHub',
    accountLabel: 'Repository',
    accountPlaceholder: 'owner/name',
    eventTypes: MANAGED_CLOUD_GITHUB_TRIGGER_EVENT_TYPES,
    note: 'Fires for repositories your GitHub App installation covers.',
  },
  {
    value: 'slack',
    label: 'Slack',
    accountLabel: 'Workspace (team) id',
    accountPlaceholder: 'T0123ABCD',
    eventTypes: null,
    note: 'Post the verification code shown after saving in that workspace to prove it is yours.',
  },
  {
    value: 'gmail',
    label: 'Gmail',
    accountLabel: 'Mailbox address',
    accountPlaceholder: 'you@example.com',
    eventTypes: MANAGED_CLOUD_GMAIL_TRIGGER_EVENT_TYPES,
    note: 'Runs once for each new email in this inbox. Use the address of the Gmail account connected in Connectors.',
  },
  {
    value: 'google_calendar',
    label: 'Google Calendar',
    accountLabel: null,
    accountPlaceholder: '',
    eventTypes: MANAGED_CLOUD_GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
    note: 'Addressed by its own channel. Waits until the calendar watch is registered for it.',
  },
  {
    value: 'connector',
    label: 'Anything else (signed webhook)',
    accountLabel: null,
    accountPlaceholder: '',
    eventTypes: null,
    note: 'You get a URL and a signing secret to post events to.',
  },
];

export const MANAGED_CLOUD_TRIGGER_SOURCE_LABELS: Readonly<
  Record<ManagedCloudTriggerSource, string>
> = {
  github: 'GitHub',
  slack: 'Slack',
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  connector: 'Webhook',
};

const CONNECTOR_BACKED_TRIGGER_SOURCES: ReadonlySet<ManagedCloudTriggerSource> = new Set([
  'gmail',
  'google_calendar',
]);

export function managedCloudTriggerSourceAvailable(
  source: ManagedCloudTriggerSource,
  connectorState: ConnectorReleaseState = CONNECTOR_RELEASE_STATE,
): boolean {
  return !CONNECTOR_BACKED_TRIGGER_SOURCES.has(source) || connectorsReleased(connectorState);
}

export function managedCloudTriggerEventTypesFromText(text: string): string[] {
  const chosen = text
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean);
  return chosen.length > 0 ? chosen : [MANAGED_CLOUD_TRIGGER_WILDCARD_EVENT_TYPE];
}

export function managedCloudMailboxWatchNotice(
  trigger: Pick<
    ManagedCloudEventTrigger,
    'source' | 'watchError' | 'verificationStatus' | 'watchExpiresAt'
  >,
  now: number = Date.now(),
): string | null {
  if (trigger.source !== 'gmail') return null;
  if (trigger.watchError) return trigger.watchError;
  if (trigger.verificationStatus === 'pending') {
    return 'The mailbox watch is not registered yet, so nothing fires.';
  }
  if (trigger.watchExpiresAt && Date.parse(trigger.watchExpiresAt) <= now) {
    return 'The mailbox watch lapsed, so new mail no longer starts this task.';
  }
  return null;
}
