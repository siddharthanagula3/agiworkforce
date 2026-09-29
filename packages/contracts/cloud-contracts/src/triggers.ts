import { z } from 'zod';
import {
  ManagedCloudScheduleFieldConditionSchema,
  type ManagedCloudScheduleFieldCondition,
} from './schedules';

export const MANAGED_CLOUD_TRIGGERS_PATH = '/api/triggers';

export const MANAGED_CLOUD_TRIGGER_SOURCES = [
  'gmail',
  'slack',
  'google_calendar',
  'github',
  'connector',
] as const;

export const MANAGED_CLOUD_GITHUB_TRIGGER_EVENT_TYPES = [
  'push',
  'pull_request.opened',
  'pull_request.reopened',
  'pull_request.synchronize',
  'pull_request.ready_for_review',
  'pull_request.closed',
  'check_run.completed',
  'workflow_run.completed',
] as const;

export const MANAGED_CLOUD_GMAIL_TRIGGER_EVENT_TYPES = ['message.received'] as const;

export const MANAGED_CLOUD_GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES = [
  'events.changed',
  'events.deleted',
] as const;

export const MANAGED_CLOUD_TRIGGER_MAX_CONDITIONS = 10;

export const ManagedCloudTriggerSourceSchema = z.enum(MANAGED_CLOUD_TRIGGER_SOURCES);
export type ManagedCloudTriggerSource = z.infer<typeof ManagedCloudTriggerSourceSchema>;

export const ManagedCloudEventTriggerSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  organizationId: z.string().nullable(),
  taskId: z.string().min(1),
  name: z.string(),
  source: ManagedCloudTriggerSourceSchema,
  eventTypes: z.array(z.string()),
  sourceAccount: z.string().nullable(),
  conditions: z.array(ManagedCloudScheduleFieldConditionSchema),
  debounceSeconds: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  isEnabled: z.boolean(),
  verificationStatus: z.enum(['pending', 'verified']),
  verifiedAt: z.string().nullable(),
  watchExpiresAt: z.string().nullable(),
  watchError: z.string().nullable(),
  lastFiredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ManagedCloudEventTrigger = z.infer<typeof ManagedCloudEventTriggerSchema>;

const TriggerPageSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const ManagedCloudEventTriggerListResponseSchema = z.object({
  triggers: z.array(ManagedCloudEventTriggerSchema),
  pagination: TriggerPageSchema.optional(),
});
export type ManagedCloudEventTriggerListResponse = z.infer<
  typeof ManagedCloudEventTriggerListResponseSchema
>;

export const ManagedCloudEventTriggerResponseSchema = z.object({
  trigger: ManagedCloudEventTriggerSchema,
});
export type ManagedCloudEventTriggerResponse = z.infer<
  typeof ManagedCloudEventTriggerResponseSchema
>;

export const ManagedCloudEventTriggerDeletedResponseSchema = z.object({
  success: z.literal(true),
});
export type ManagedCloudEventTriggerDeletedResponse = z.infer<
  typeof ManagedCloudEventTriggerDeletedResponseSchema
>;

export const MANAGED_CLOUD_TRIGGER_DELIVERY_OUTCOMES = [
  'received',
  'filtered',
  'debounced',
  'enqueued',
  'fired',
  'failed',
  'dead',
] as const;

export const ManagedCloudEventTriggerDeliverySchema = z.object({
  id: z.string().min(1),
  triggerId: z.string().min(1),
  source: ManagedCloudTriggerSourceSchema,
  eventType: z.string(),
  deliveryId: z.string(),
  outcome: z.enum(MANAGED_CLOUD_TRIGGER_DELIVERY_OUTCOMES),
  detail: z.string().nullable(),
  jobId: z.string().nullable(),
  runId: z.string().nullable(),
  receivedAt: z.string(),
  updatedAt: z.string(),
});

export const ManagedCloudEventTriggerDeliveryListResponseSchema = z.object({
  events: z.array(ManagedCloudEventTriggerDeliverySchema),
  pagination: TriggerPageSchema,
});
export type ManagedCloudEventTriggerDeliveryListResponse = z.infer<
  typeof ManagedCloudEventTriggerDeliveryListResponseSchema
>;

export const ManagedCloudEventTriggerCreatedResponseSchema = z.object({
  trigger: ManagedCloudEventTriggerSchema,
  verificationCode: z.string().nullable(),
  signingSecret: z.string().nullable(),
  webhookPath: z.string(),
});
export type ManagedCloudEventTriggerCreated = z.infer<
  typeof ManagedCloudEventTriggerCreatedResponseSchema
>;

export interface ManagedCloudEventTriggerInput {
  taskId: string;
  name: string;
  source: ManagedCloudTriggerSource;
  eventTypes: string[];
  sourceAccount?: string;
  debounceSeconds: number;
  conditions: ManagedCloudScheduleFieldCondition[];
}

export function managedCloudTriggersForTaskPath(taskId: string): string {
  return `${MANAGED_CLOUD_TRIGGERS_PATH}?taskId=${encodeURIComponent(taskId)}`;
}

export function managedCloudTriggerPath(triggerId: string): string {
  return `${MANAGED_CLOUD_TRIGGERS_PATH}/${encodeURIComponent(triggerId)}`;
}

export function managedCloudTriggerWatchPath(triggerId: string): string {
  return `${managedCloudTriggerPath(triggerId)}/watch`;
}

type ConditionOperator = ManagedCloudScheduleFieldCondition['operator'];
type ConditionValue = NonNullable<ManagedCloudScheduleFieldCondition['value']>;

export const MANAGED_CLOUD_TRIGGER_EVENT_FIELDS: Readonly<
  Record<ManagedCloudTriggerSource, ReadonlyArray<{ label: string; path: string }>>
> = {
  github: [
    { label: 'Repository', path: 'data.repository' },
    { label: 'Action', path: 'data.action' },
    { label: 'Branch', path: 'data.branch' },
    { label: 'Author', path: 'data.author' },
    { label: 'Title', path: 'data.title' },
    { label: 'Base branch', path: 'data.baseRef' },
    { label: 'Head branch', path: 'data.headRef' },
    { label: 'Is draft', path: 'data.draft' },
    { label: 'Is merged', path: 'data.merged' },
    { label: 'Conclusion', path: 'data.conclusion' },
    { label: 'Workflow or check name', path: 'data.name' },
  ],
  gmail: [
    { label: 'From', path: 'data.from' },
    { label: 'To', path: 'data.to' },
    { label: 'Subject', path: 'data.subject' },
    { label: 'Preview', path: 'data.snippet' },
    { label: 'Labels', path: 'data.labels' },
  ],
  slack: [
    { label: 'Channel', path: 'data.channel' },
    { label: 'User', path: 'data.user' },
    { label: 'Message text', path: 'data.text' },
  ],
  google_calendar: [{ label: 'Resource state', path: 'data.resourceState' }],
  connector: [],
};

export const MANAGED_CLOUD_TRIGGER_CONDITION_OPERATORS: ReadonlyArray<{
  value: ConditionOperator;
  label: string;
}> = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'in', label: 'is one of' },
  { value: 'exists', label: 'is present' },
  { value: 'not_exists', label: 'is missing' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
];

export const TRIGGER_CONDITION_OTHER_FIELD = '__other__';

const VALUELESS_OPERATORS: ReadonlySet<ConditionOperator> = new Set(['exists', 'not_exists']);
const NUMERIC_OPERATORS: ReadonlySet<ConditionOperator> = new Set(['greater_than', 'less_than']);

export function triggerConditionTakesValue(operator: ConditionOperator): boolean {
  return !VALUELESS_OPERATORS.has(operator);
}

export function triggerConditionIsNumeric(operator: ConditionOperator): boolean {
  return NUMERIC_OPERATORS.has(operator);
}

export interface TriggerConditionDraft {
  key: string;
  field: string;
  customField: string;
  operator: ConditionOperator;
  value: string;
}

let conditionDraftKey = 0;

function nextConditionDraftKey(): string {
  conditionDraftKey += 1;
  return `condition-${conditionDraftKey}`;
}

export function newTriggerConditionDraft(source: ManagedCloudTriggerSource): TriggerConditionDraft {
  const first = MANAGED_CLOUD_TRIGGER_EVENT_FIELDS[source][0];
  return {
    key: nextConditionDraftKey(),
    field: first ? first.path : TRIGGER_CONDITION_OTHER_FIELD,
    customField: '',
    operator: 'contains',
    value: '',
  };
}

function conditionValueText(value: ConditionValue | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function triggerConditionDraftsFrom(
  conditions: readonly ManagedCloudScheduleFieldCondition[],
  source: ManagedCloudTriggerSource,
): TriggerConditionDraft[] {
  const known = new Set(MANAGED_CLOUD_TRIGGER_EVENT_FIELDS[source].map((entry) => entry.path));
  return conditions.map((condition) => ({
    key: nextConditionDraftKey(),
    field: known.has(condition.field) ? condition.field : TRIGGER_CONDITION_OTHER_FIELD,
    customField: known.has(condition.field) ? '' : condition.field,
    operator: condition.operator,
    value: conditionValueText(condition.value),
  }));
}

export function triggerConditionsFromDrafts(
  drafts: readonly TriggerConditionDraft[],
): { ok: true; conditions: ManagedCloudScheduleFieldCondition[] } | { ok: false; error: string } {
  const conditions: ManagedCloudScheduleFieldCondition[] = [];
  for (const draft of drafts) {
    const field = (
      draft.field === TRIGGER_CONDITION_OTHER_FIELD ? draft.customField : draft.field
    ).trim();
    if (!field) return { ok: false, error: 'Choose a field for every condition.' };
    if (!triggerConditionTakesValue(draft.operator)) {
      conditions.push({ field, operator: draft.operator });
      continue;
    }
    const text = draft.value.trim();
    if (!text) return { ok: false, error: 'Give every condition a value to compare against.' };
    if (triggerConditionIsNumeric(draft.operator)) {
      const number = Number(text);
      if (!Number.isFinite(number)) {
        return { ok: false, error: 'Greater than and less than compare against a number.' };
      }
      conditions.push({ field, operator: draft.operator, value: number });
      continue;
    }
    if (draft.operator === 'in') {
      const list = text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      conditions.push({ field, operator: 'in', value: list });
      continue;
    }
    conditions.push({ field, operator: draft.operator, value: text });
  }
  return { ok: true, conditions };
}

export function describeTriggerConditions(
  conditions: readonly ManagedCloudScheduleFieldCondition[],
  source: ManagedCloudTriggerSource,
): string {
  const labels = new Map(
    MANAGED_CLOUD_TRIGGER_EVENT_FIELDS[source].map((entry) => [entry.path, entry.label]),
  );
  return conditions
    .map((condition) => {
      const field = labels.get(condition.field) ?? condition.field;
      const operator =
        MANAGED_CLOUD_TRIGGER_CONDITION_OPERATORS.find(
          (entry) => entry.value === condition.operator,
        )?.label ?? condition.operator;
      return triggerConditionTakesValue(condition.operator)
        ? `${field} ${operator} ${conditionValueText(condition.value)}`
        : `${field} ${operator}`;
    })
    .join('; ');
}
