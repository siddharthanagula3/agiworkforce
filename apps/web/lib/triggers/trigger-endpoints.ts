import type { EventTrigger, TriggerSource } from './trigger-types';

const RECEIVER_PATHS: Readonly<Record<TriggerSource, string | null>> = {
  gmail: '/api/webhooks/gmail',
  slack: '/api/webhooks/slack',
  google_calendar: '/api/webhooks/google-calendar',
  github: '/api/github/webhook',
  connector: null,
};

export function triggerWebhookPath(trigger: Pick<EventTrigger, 'id' | 'source'>): string {
  const shared = RECEIVER_PATHS[trigger.source];
  return shared ?? `/api/webhooks/connectors/${trigger.id}`;
}
