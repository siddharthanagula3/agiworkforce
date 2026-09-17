import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  FieldConditionError,
  normalizeFieldConditions,
  type FieldCondition,
} from '@/lib/automation/field-conditions';
import { secureTokenHex } from '@/lib/secure-random';

import {
  isTriggerSource,
  isValidTriggerEventType,
  WILDCARD_EVENT_TYPE,
  type EventTrigger,
  type EventTriggerDelivery,
  type TriggerEventOutcome,
  type TriggerSource,
} from './trigger-types';
import { connectorTriggerSecret, hashVerificationCode } from './trigger-signatures';

const MAX_PAGE_SIZE = 100;
const MAX_TRIGGERS_PER_ACCOUNT = 50;
const SLACK_TEAM_RE = /^[A-Z][A-Z0-9]{5,20}$/;
const GITHUB_REPOSITORY_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const EMAIL_RE = /^[^\s@]{1,200}@[^\s@]{1,100}\.[A-Za-z]{2,24}$/;

export class TriggerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TriggerValidationError';
  }
}

export class TriggerNotFoundError extends Error {
  constructor(message = 'Trigger not found') {
    super(message);
    this.name = 'TriggerNotFoundError';
  }
}

export class TriggerLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TriggerLimitError';
  }
}

export interface TriggerRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  organization_id: string | null;
  task_id: string;
  name: string;
  source: string;
  event_types: string[];
  source_account: string | null;
  conditions: FieldCondition[] | null;
  debounce_seconds: number;
  max_attempts: number;
  is_enabled: boolean;
  verification_status: string;
  verified_at: string | null;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DeliveryRow extends Record<string, unknown> {
  id: string;
  trigger_id: string;
  source: string;
  event_type: string;
  delivery_id: string;
  outcome: string;
  detail: string | null;
  job_id: string | null;
  run_id: string | null;
  received_at: string;
  updated_at: string;
}

export function mapTrigger(row: TriggerRow): EventTrigger {
  if (!isTriggerSource(row.source)) throw new Error(`Unknown trigger source: ${row.source}`);
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    taskId: row.task_id,
    name: row.name,
    source: row.source,
    eventTypes: row.event_types,
    sourceAccount: row.source_account,
    conditions: row.conditions ?? [],
    debounceSeconds: Number(row.debounce_seconds),
    maxAttempts: Number(row.max_attempts),
    isEnabled: row.is_enabled,
    verificationStatus: row.verification_status === 'verified' ? 'verified' : 'pending',
    verifiedAt: row.verified_at,
    lastFiredAt: row.last_fired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDelivery(row: DeliveryRow): EventTriggerDelivery {
  return {
    id: row.id,
    triggerId: row.trigger_id,
    source: row.source as TriggerSource,
    eventType: row.event_type,
    deliveryId: row.delivery_id,
    outcome: row.outcome as TriggerEventOutcome,
    detail: row.detail,
    jobId: row.job_id,
    runId: row.run_id,
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
  };
}

export interface TriggerInput {
  taskId: string;
  name: string;
  source: TriggerSource;
  eventTypes: string[];
  sourceAccount?: string | null;
  conditions?: unknown;
  debounceSeconds?: number;
  maxAttempts?: number;
  isEnabled?: boolean;
}

interface ValidatedTrigger {
  taskId: string;
  name: string;
  source: TriggerSource;
  eventTypes: string[];
  sourceAccount: string | null;
  conditions: FieldCondition[];
  debounceSeconds: number;
  maxAttempts: number;
  isEnabled: boolean;
}

const TRIGGER_INPUT_KEYS = new Set([
  'taskId',
  'name',
  'source',
  'eventTypes',
  'sourceAccount',
  'conditions',
  'debounceSeconds',
  'maxAttempts',
  'isEnabled',
]);

function normalizeSourceAccount(source: TriggerSource, value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (source === 'google_calendar' || source === 'connector') {
    if (raw) throw new TriggerValidationError(`${source} triggers are addressed by their own id`);
    return null;
  }
  if (!raw) throw new TriggerValidationError(`${source} triggers need the account to listen to`);
  if (source === 'gmail') {
    const address = raw.toLowerCase();
    if (!EMAIL_RE.test(address))
      throw new TriggerValidationError('Gmail triggers need a mailbox address');
    return address;
  }
  if (source === 'slack') {
    const team = raw.toUpperCase();
    if (!SLACK_TEAM_RE.test(team))
      throw new TriggerValidationError('Slack triggers need a workspace (team) id');
    return team;
  }
  const repository = raw.toLowerCase();
  if (!GITHUB_REPOSITORY_RE.test(repository)) {
    throw new TriggerValidationError('GitHub triggers need a repository as owner/name');
  }
  return repository;
}

export function validateTriggerInput(input: TriggerInput): ValidatedTrigger {
  const unknownKeys = Object.keys(input).filter((key) => !TRIGGER_INPUT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new TriggerValidationError(`Unknown trigger field: ${unknownKeys.join(', ')}`);
  }
  const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : '';
  if (!taskId) throw new TriggerValidationError('taskId is required');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 200)
    throw new TriggerValidationError('Name must be 1 to 200 characters');
  if (!isTriggerSource(input.source)) throw new TriggerValidationError('source is invalid');
  const eventTypes = Array.isArray(input.eventTypes)
    ? [...new Set(input.eventTypes.map((type) => String(type).trim()))]
    : [];
  if (eventTypes.length === 0 || eventTypes.length > 20) {
    throw new TriggerValidationError('A trigger listens to 1 to 20 event types');
  }
  for (const type of eventTypes) {
    if (!isValidTriggerEventType(input.source, type)) {
      throw new TriggerValidationError(`${type} is not an event ${input.source} sends`);
    }
  }
  const debounceSeconds = input.debounceSeconds ?? 0;
  if (!Number.isInteger(debounceSeconds) || debounceSeconds < 0 || debounceSeconds > 86_400) {
    throw new TriggerValidationError('debounceSeconds must be between 0 and 86400');
  }
  const maxAttempts = input.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new TriggerValidationError('maxAttempts must be between 1 and 10');
  }
  if (input.isEnabled !== undefined && typeof input.isEnabled !== 'boolean') {
    throw new TriggerValidationError('isEnabled must be a boolean');
  }
  let conditions: FieldCondition[];
  try {
    conditions = normalizeFieldConditions(input.conditions);
  } catch (error) {
    throw new TriggerValidationError(
      error instanceof FieldConditionError ? error.message : String(error),
    );
  }
  return {
    taskId,
    name,
    source: input.source,
    eventTypes,
    sourceAccount: normalizeSourceAccount(input.source, input.sourceAccount),
    conditions,
    debounceSeconds,
    maxAttempts,
    isEnabled: input.isEnabled ?? true,
  };
}

export interface CreatedTrigger {
  trigger: EventTrigger;
  verificationCode: string | null;
  signingSecret: string | null;
}

export async function createTrigger(
  db: DatabaseAdapter,
  scope: { userId: string; organizationId: string | null },
  input: TriggerInput,
): Promise<CreatedTrigger> {
  const definition = validateTriggerInput(input);
  const [existing] = await db.query<{ count: string }>(
    `select count(*)::text as count from event_triggers where user_id = $1`,
    [scope.userId],
  );
  if (Number.parseInt(existing?.count ?? '0', 10) >= MAX_TRIGGERS_PER_ACCOUNT) {
    throw new TriggerLimitError(
      `An account can have up to ${MAX_TRIGGERS_PER_ACCOUNT} triggers. Delete one to add another.`,
    );
  }
  const [task] = await db.query<{ id: string }>(
    `select id from scheduled_tasks where id = $1 and user_id = $2 limit 1`,
    [definition.taskId, scope.userId],
  );
  if (!task) throw new TriggerValidationError('Task not found or not owned by this account');

  const selfVerifying = definition.source === 'github' || definition.source === 'connector';
  const verificationCode = definition.source === 'slack' ? secureTokenHex(6) : null;

  const [row] = await db.query<TriggerRow>(
    `insert into event_triggers (
       user_id, organization_id, task_id, name, source, event_types, source_account,
       conditions, debounce_seconds, max_attempts, is_enabled,
       verification_status, verification_code_sha256
     ) values (
       $1, $2, $3, $4, $5, $6::text[], $7,
       $8::jsonb, $9, $10, $11,
       $12, $13
     ) returning *`,
    [
      scope.userId,
      scope.organizationId,
      definition.taskId,
      definition.name,
      definition.source,
      definition.eventTypes,
      definition.sourceAccount,
      JSON.stringify(definition.conditions),
      definition.debounceSeconds,
      definition.maxAttempts,
      definition.isEnabled,
      selfVerifying ? 'verified' : 'pending',
      verificationCode ? hashVerificationCode(verificationCode) : null,
    ],
  );
  if (!row) throw new Error('Trigger insert returned no row');
  const trigger = mapTrigger(row);
  return {
    trigger,
    verificationCode,
    signingSecret: definition.source === 'connector' ? connectorTriggerSecret(trigger.id) : null,
  };
}

export type TriggerUpdateInput = Partial<
  Pick<
    TriggerInput,
    'name' | 'eventTypes' | 'conditions' | 'debounceSeconds' | 'maxAttempts' | 'isEnabled'
  >
>;

export async function updateTrigger(
  db: DatabaseAdapter,
  userId: string,
  triggerId: string,
  patch: TriggerUpdateInput,
): Promise<EventTrigger> {
  const current = await getTrigger(db, userId, triggerId);
  const definition = validateTriggerInput({
    taskId: current.taskId,
    name: patch.name ?? current.name,
    source: current.source,
    eventTypes: patch.eventTypes ?? current.eventTypes,
    sourceAccount: current.sourceAccount,
    conditions: patch.conditions ?? current.conditions,
    debounceSeconds: patch.debounceSeconds ?? current.debounceSeconds,
    maxAttempts: patch.maxAttempts ?? current.maxAttempts,
    isEnabled: patch.isEnabled ?? current.isEnabled,
  });
  const [row] = await db.query<TriggerRow>(
    `update event_triggers
        set name = $3, event_types = $4::text[], conditions = $5::jsonb,
            debounce_seconds = $6, max_attempts = $7, is_enabled = $8, updated_at = now()
      where id = $1 and user_id = $2
      returning *`,
    [
      triggerId,
      userId,
      definition.name,
      definition.eventTypes,
      JSON.stringify(definition.conditions),
      definition.debounceSeconds,
      definition.maxAttempts,
      definition.isEnabled,
    ],
  );
  if (!row) throw new TriggerNotFoundError();
  return mapTrigger(row);
}

export async function getTrigger(
  db: DatabaseAdapter,
  userId: string,
  triggerId: string,
): Promise<EventTrigger> {
  const [row] = await db.query<TriggerRow>(
    `select * from event_triggers where id = $1 and user_id = $2 limit 1`,
    [triggerId, userId],
  );
  if (!row) throw new TriggerNotFoundError();
  return mapTrigger(row);
}

export async function listTriggers(
  db: DatabaseAdapter,
  userId: string,
  page: { limit: number; offset: number; taskId?: string | null },
): Promise<EventTrigger[]> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(page.limit)));
  const offset = Math.min(10_000, Math.max(0, Math.trunc(page.offset)));
  const rows = await db.query<TriggerRow>(
    `select * from event_triggers
      where user_id = $1 and ($2::uuid is null or task_id = $2)
      order by created_at desc, id desc
      limit $3 offset $4`,
    [userId, page.taskId ?? null, limit, offset],
  );
  return rows.map(mapTrigger);
}

export async function deleteTrigger(
  db: DatabaseAdapter,
  userId: string,
  triggerId: string,
): Promise<void> {
  const affected = await db.execute(`delete from event_triggers where id = $1 and user_id = $2`, [
    triggerId,
    userId,
  ]);
  if (affected !== 1) throw new TriggerNotFoundError();
}

export async function listTriggerDeliveries(
  db: DatabaseAdapter,
  userId: string,
  triggerId: string,
  page: { limit: number; offset: number },
): Promise<EventTriggerDelivery[]> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(page.limit)));
  const offset = Math.min(10_000, Math.max(0, Math.trunc(page.offset)));
  const rows = await db.query<DeliveryRow>(
    `select event.* from event_trigger_events as event
      join event_triggers as trigger on trigger.id = event.trigger_id
     where event.trigger_id = $1 and event.user_id = $2 and trigger.user_id = $2
     order by event.received_at desc, event.id desc
     limit $3 offset $4`,
    [triggerId, userId, limit, offset],
  );
  return rows.map(mapDelivery);
}

export function triggerListensTo(trigger: EventTrigger, type: string): boolean {
  const family = type.split('.')[0] ?? type;
  return trigger.eventTypes.some(
    (entry) => entry === WILDCARD_EVENT_TYPE || entry === type || entry === family,
  );
}
