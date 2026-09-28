import { JOB_QUEUE_POLICIES } from '@/lib/jobs/job-queues';

export const DEVELOPER_WEBHOOK_EVENTS = [
  {
    type: 'api_key.created',
    label: 'API key created',
    description: 'A key was created in the developer console or in settings.',
  },
  {
    type: 'api_key.revoked',
    label: 'API key revoked',
    description: 'A key was deleted, or revoked because its project was archived.',
  },
  {
    type: 'project.spend_limit_reached',
    label: 'Project spend limit reached',
    description:
      'A project used its monthly credit limit, so its keys are refused until the month ends.',
  },
  {
    type: 'task_run.completed',
    label: 'Task run completed',
    description: 'A scheduled or started task finished its run.',
  },
  {
    type: 'task_run.failed',
    label: 'Task run failed',
    description: 'A task run failed or reached its time limit.',
  },
  {
    type: 'task_run.needs_approval',
    label: 'Task run needs approval',
    description: 'A task run paused until someone approves its next step.',
  },
] as const;

export type DeveloperWebhookEventType = (typeof DEVELOPER_WEBHOOK_EVENTS)[number]['type'];

export const DEVELOPER_WEBHOOK_EVENT_TYPES: readonly DeveloperWebhookEventType[] =
  DEVELOPER_WEBHOOK_EVENTS.map((event) => event.type);

export const DEVELOPER_WEBHOOK_TEST_EVENT = 'webhook.test';

export function isDeveloperWebhookEventType(value: string): value is DeveloperWebhookEventType {
  return (DEVELOPER_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export const DEVELOPER_WEBHOOK_MAX_ATTEMPTS = 20;
export const DEVELOPER_WEBHOOK_TIMEOUT_SECONDS = 10;

const SECONDS_PER_DAY = 86_400;

export function developerWebhookRetryDays(): number {
  const { backoffBaseSeconds, backoffMaxSeconds } = JOB_QUEUE_POLICIES.webhooks;
  let seconds = 0;
  for (let attempt = 1; attempt < DEVELOPER_WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
    seconds += Math.min(backoffMaxSeconds, backoffBaseSeconds * 2 ** (attempt - 1));
  }
  return Math.max(1, Math.round(seconds / SECONDS_PER_DAY));
}
