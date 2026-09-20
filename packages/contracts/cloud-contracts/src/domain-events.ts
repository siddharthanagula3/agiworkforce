import {
  AUDIT_RETENTION_CLASSES,
  CONCEPT_NAMES,
  type AuditRetentionClass,
  type ConceptName,
} from '@agiworkforce/types';
import { z } from 'zod';

/**
 * One name shape for every durable event, so a consumer can subscribe to
 * "everything that happened to a project" without knowing which service wrote
 * it. Before this, each service invented its own spelling and only the
 * developer-session namespace had a convention at all.
 *
 * The shape is `<namespace>.<object>.<verb>`, all lower case, with the verb
 * drawn from the closed set below. A closed verb set is what makes the
 * convention checkable rather than aspirational: `deleted` and `removed` are
 * the same event, and only one of them is a name.
 */
export const DOMAIN_EVENT_VERBS = [
  'created',
  'updated',
  'deleted',
  'archived',
  'restored',
  'purged',
  'started',
  'completed',
  'failed',
  'cancelled',
  'requested',
  'resolved',
  'approved',
  'denied',
  'granted',
  'revoked',
  'exported',
  'published',
  'changed',
  'exceeded',
] as const;

export type DomainEventVerb = (typeof DOMAIN_EVENT_VERBS)[number];

const SEGMENT = '[a-z][a-z0-9]*';

export const DOMAIN_EVENT_NAME_PATTERN = new RegExp(
  `^${SEGMENT}\\.${SEGMENT}\\.(?:${DOMAIN_EVENT_VERBS.join('|')})$`,
);

export function isDomainEventName(value: string): boolean {
  return DOMAIN_EVENT_NAME_PATTERN.test(value);
}

export function domainEventName(namespace: string, object: string, verb: DomainEventVerb): string {
  const name = `${namespace}.${object}.${verb}`;
  if (!isDomainEventName(name)) {
    throw new Error(`domain event: '${name}' does not follow <namespace>.<object>.<verb>`);
  }
  return name;
}

export const DOMAIN_EVENT_NAMESPACES = [
  'chat',
  'project',
  'memory',
  'schedule',
  'skill',
  'connector',
  'artifact',
  'workspace',
  'billing',
  'identity',
  'trust',
] as const;

export type DomainEventNamespace = (typeof DOMAIN_EVENT_NAMESPACES)[number];

/**
 * The module that writes every event in a namespace, as a path in this
 * repository. It is the answer to "who do I ask about this event", and it is a
 * path rather than a team name so a rename fails a guard instead of leaving a
 * reader with a name nobody answers to.
 */
export const DOMAIN_EVENT_OWNERS: Readonly<Record<DomainEventNamespace, string>> = Object.freeze({
  chat: 'apps/web/lib/services',
  project: 'apps/web/lib/services',
  memory: 'apps/web/lib/services',
  schedule: 'apps/web/lib/services',
  skill: 'apps/web/lib/services',
  connector: 'apps/web/lib/services',
  artifact: 'apps/web/lib/services',
  workspace: 'apps/web/lib/services',
  billing: 'apps/web/lib/server/payments',
  identity: 'apps/web/lib/identity',
  trust: 'apps/web/lib/security',
});

/**
 * What the payload of an event may carry, which decides where a copy of it may
 * go. A sink that is allowed operational data is not thereby allowed message
 * text, and without a class on the envelope every sink has to guess.
 */
export const DOMAIN_EVENT_DATA_CLASSES = ['none', 'account', 'personal', 'content'] as const;

export type DomainEventDataClass = (typeof DOMAIN_EVENT_DATA_CLASSES)[number];

/** The sinks an event is written for. A sink not named here must not read it. */
export const DOMAIN_EVENT_CONSUMERS = [
  'audit-log',
  'siem-export',
  'product-analytics',
  'notifications',
  'read-model',
] as const;

export type DomainEventConsumer = (typeof DOMAIN_EVENT_CONSUMERS)[number];

export interface DomainEventDefinition {
  readonly name: string;
  readonly namespace: DomainEventNamespace;
  /** The concept the event is about, so a reader can join it to the registry. */
  readonly concept: ConceptName;
  /** Consequential events are the ones that owe an audit record. */
  readonly consequential: boolean;
  readonly owner: string;
  readonly consumers: readonly DomainEventConsumer[];
  readonly dataClass: DomainEventDataClass;
  /** Payload keys carrying data about a person, empty for anything else. */
  readonly piiFields: readonly string[];
  readonly retentionClass: AuditRetentionClass;
}

interface DomainEventOverrides {
  readonly consumers?: readonly DomainEventConsumer[];
  readonly dataClass?: DomainEventDataClass;
  readonly piiFields?: readonly string[];
  readonly retentionClass?: AuditRetentionClass;
}

function define(
  namespace: DomainEventNamespace,
  object: string,
  verb: DomainEventVerb,
  concept: ConceptName,
  consequential: boolean,
  overrides: DomainEventOverrides = {},
): DomainEventDefinition {
  return {
    name: domainEventName(namespace, object, verb),
    namespace,
    concept,
    consequential,
    owner: DOMAIN_EVENT_OWNERS[namespace],
    consumers: overrides.consumers ?? (consequential ? ['audit-log'] : ['read-model']),
    dataClass: overrides.dataClass ?? 'none',
    piiFields: overrides.piiFields ?? [],
    retentionClass: overrides.retentionClass ?? (consequential ? 'security' : 'operational'),
  };
}

// The only envelope field that always identifies a person is the actor; a
// subject id identifies the object, which for these events is a conversation,
// a workspace or an audit record. Anything else a reader needs is a payload key
// the event is required to carry, and is named as one.
const ACTOR_PII: readonly string[] = ['actor.userId'];
const MEMBERSHIP_PII: readonly string[] = ['actor.userId', 'payload.memberUserId'];
const SESSION_PII: readonly string[] = ['actor.userId', 'payload.ipAddress'];
const SECURITY_SINKS: readonly DomainEventConsumer[] = ['audit-log', 'siem-export'];

const AUTHORED: DomainEventOverrides = { dataClass: 'content', piiFields: ACTOR_PII };
const ACCOUNT: DomainEventOverrides = { dataClass: 'account', piiFields: ACTOR_PII };
const MEMBERSHIP: DomainEventOverrides = {
  consumers: SECURITY_SINKS,
  dataClass: 'personal',
  piiFields: MEMBERSHIP_PII,
  retentionClass: 'compliance',
};
const SESSION: DomainEventOverrides = {
  consumers: SECURITY_SINKS,
  dataClass: 'personal',
  piiFields: SESSION_PII,
  retentionClass: 'compliance',
};

/**
 * The catalog is the source of truth for durable event names. It is deliberately
 * short: an event earns a place here when something outside the writing service
 * reacts to it, not when a service logs a step of its own work.
 */
export const DOMAIN_EVENTS: readonly DomainEventDefinition[] = Object.freeze([
  define('chat', 'conversation', 'created', 'conversation', false, AUTHORED),
  define('chat', 'conversation', 'archived', 'conversation', true),
  define('chat', 'conversation', 'deleted', 'conversation', true),
  define('chat', 'conversation', 'restored', 'conversation', true),
  define('chat', 'conversation', 'purged', 'conversation', true, {
    retentionClass: 'compliance',
  }),
  define('chat', 'message', 'created', 'message', false, AUTHORED),
  define('project', 'project', 'created', 'project', false, AUTHORED),
  define('project', 'project', 'deleted', 'project', true),
  define('project', 'knowledge', 'created', 'project', false, AUTHORED),
  define('memory', 'entry', 'created', 'memory', false, AUTHORED),
  define('memory', 'entry', 'deleted', 'memory', true),
  define('schedule', 'run', 'started', 'schedule', false),
  define('schedule', 'run', 'completed', 'schedule', false),
  define('schedule', 'run', 'failed', 'schedule', true),
  define('skill', 'install', 'completed', 'skill', true, { consumers: SECURITY_SINKS }),
  define('connector', 'grant', 'granted', 'connector', true, { consumers: SECURITY_SINKS }),
  define('connector', 'grant', 'revoked', 'connector', true, { consumers: SECURITY_SINKS }),
  define('artifact', 'version', 'created', 'artifact', false, AUTHORED),
  define('artifact', 'share', 'published', 'artifact', true, { consumers: SECURITY_SINKS }),
  define('workspace', 'member', 'granted', 'workspace', true, MEMBERSHIP),
  define('workspace', 'member', 'revoked', 'workspace', true, MEMBERSHIP),
  define('workspace', 'policy', 'changed', 'workspace', true, { consumers: SECURITY_SINKS }),
  define('billing', 'subscription', 'changed', 'subscription', true, {
    ...ACCOUNT,
    retentionClass: 'compliance',
  }),
  define('billing', 'credits', 'exceeded', 'credit-bucket', true, ACCOUNT),
  define('billing', 'reservation', 'resolved', 'usage-reservation', false, ACCOUNT),
  define('identity', 'session', 'started', 'audit-event', true, SESSION),
  define('identity', 'session', 'completed', 'audit-event', true, SESSION),
  define('identity', 'data', 'exported', 'audit-event', true, SESSION),
  define('trust', 'egress', 'approved', 'audit-event', true, { consumers: SECURITY_SINKS }),
  define('trust', 'egress', 'denied', 'audit-event', true, { consumers: SECURITY_SINKS }),
]);

export const DOMAIN_EVENT_NAMES: readonly string[] = Object.freeze(
  DOMAIN_EVENTS.map((event) => event.name),
);

export function findDomainEvent(name: string): DomainEventDefinition | null {
  return DOMAIN_EVENTS.find((event) => event.name === name) ?? null;
}

export function domainEventsForConcept(concept: ConceptName): DomainEventDefinition[] {
  return DOMAIN_EVENTS.filter((event) => event.concept === concept);
}

export const CONCEPTS_WITHOUT_DOMAIN_EVENTS: readonly ConceptName[] = Object.freeze(
  CONCEPT_NAMES.filter((concept) => domainEventsForConcept(concept).length === 0),
);

/**
 * The envelope every durable event carries. `correlationId` joins an event to
 * the operation that produced it and `causationId` to the event that produced
 * it, which is what makes a chain reconstructable from storage alone.
 */
export const DomainEventEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(1),
  name: z.string().refine(isDomainEventName, {
    message: 'event name must be <namespace>.<object>.<verb>',
  }),
  occurredAt: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
  operationRef: z.string().min(1).optional(),
  subject: z.object({
    concept: z.enum(CONCEPT_NAMES),
    id: z.string().min(1),
  }),
  actor: z
    .object({
      userId: z.string().min(1).nullable(),
      organizationId: z.string().min(1).nullable().optional(),
    })
    .optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  /** How long the record must be kept, read from the catalogue at creation. */
  retentionClass: z.enum(AUDIT_RETENTION_CLASSES),
  /** What the payload may carry, so a sink can refuse an event it may not hold. */
  dataClass: z.enum(DOMAIN_EVENT_DATA_CLASSES),
  /**
   * What a consumer stores to answer "have I already handled this". It is the
   * event id by default; an event a producer may legitimately re-raise carries
   * a key of its own so the retry and the re-raise are told apart.
   */
  dedupeKey: z.string().min(1),
});

export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;

export const DOMAIN_EVENT_SCHEMA_VERSION = 1;

export interface CreateDomainEventInput {
  eventId: string;
  name: string;
  occurredAt: string;
  subject: DomainEventEnvelope['subject'];
  correlationId?: string;
  causationId?: string;
  operationRef?: string;
  actor?: DomainEventEnvelope['actor'];
  payload?: Record<string, unknown>;
  /** Only when the producer may raise this event more than once on purpose. */
  dedupeKey?: string;
}

/**
 * The only way to mint an envelope. Retention and classification are read from
 * the catalogue rather than passed in: a producer that got to choose its own
 * retention would be choosing how long its own mistakes are kept.
 */
export function createDomainEventEnvelope(input: CreateDomainEventInput): DomainEventEnvelope {
  const definition = findDomainEvent(input.name);
  if (!definition) throw new Error(`domain event: '${input.name}' is not in the catalog`);
  return DomainEventEnvelopeSchema.parse({
    schemaVersion: DOMAIN_EVENT_SCHEMA_VERSION,
    eventId: input.eventId,
    name: input.name,
    occurredAt: input.occurredAt,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    ...(input.operationRef === undefined ? {} : { operationRef: input.operationRef }),
    subject: input.subject,
    ...(input.actor === undefined ? {} : { actor: input.actor }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    retentionClass: definition.retentionClass,
    dataClass: definition.dataClass,
    dedupeKey: input.dedupeKey ?? input.eventId,
  });
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
}

/**
 * A stable serialization of everything an event asserts. Key order and absent
 * optional fields cannot change it, so two writes of the same event produce the
 * same string and a rewritten one does not.
 */
export function domainEventFingerprint(envelope: DomainEventEnvelope): string {
  return stableSerialize(envelope);
}

/**
 * Immutability, enforceable by the store: an event may be written once. A second
 * delivery of the same id is either the identical event, which is a redelivery
 * to drop, or a different one, which is a bug in the producer and must be
 * refused rather than silently overwriting what consumers already read.
 */
export function assertDomainEventUnchanged(
  stored: DomainEventEnvelope,
  incoming: DomainEventEnvelope,
): void {
  if (stored.eventId !== incoming.eventId) {
    throw new Error('domain event: refusing to compare envelopes with different ids');
  }
  if (domainEventFingerprint(stored) !== domainEventFingerprint(incoming)) {
    throw new Error(`domain event: '${stored.eventId}' was already written with different content`);
  }
}
