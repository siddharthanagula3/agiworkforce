import { CONCEPT_NAMES, type ConceptName } from '@agiworkforce/types';
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

export interface DomainEventDefinition {
  readonly name: string;
  readonly namespace: DomainEventNamespace;
  /** The concept the event is about, so a reader can join it to the registry. */
  readonly concept: ConceptName;
  /** Consequential events are the ones that owe an audit record. */
  readonly consequential: boolean;
}

function define(
  namespace: DomainEventNamespace,
  object: string,
  verb: DomainEventVerb,
  concept: ConceptName,
  consequential: boolean,
): DomainEventDefinition {
  return { name: domainEventName(namespace, object, verb), namespace, concept, consequential };
}

/**
 * The catalog is the source of truth for durable event names. It is deliberately
 * short: an event earns a place here when something outside the writing service
 * reacts to it, not when a service logs a step of its own work.
 */
export const DOMAIN_EVENTS: readonly DomainEventDefinition[] = Object.freeze([
  define('chat', 'conversation', 'created', 'conversation', false),
  define('chat', 'conversation', 'archived', 'conversation', true),
  define('chat', 'conversation', 'deleted', 'conversation', true),
  define('chat', 'conversation', 'restored', 'conversation', true),
  define('chat', 'conversation', 'purged', 'conversation', true),
  define('chat', 'message', 'created', 'message', false),
  define('project', 'project', 'created', 'project', false),
  define('project', 'project', 'deleted', 'project', true),
  define('project', 'knowledge', 'created', 'project', false),
  define('memory', 'entry', 'created', 'memory', false),
  define('memory', 'entry', 'deleted', 'memory', true),
  define('schedule', 'run', 'started', 'schedule', false),
  define('schedule', 'run', 'completed', 'schedule', false),
  define('schedule', 'run', 'failed', 'schedule', true),
  define('skill', 'install', 'completed', 'skill', true),
  define('connector', 'grant', 'granted', 'connector', true),
  define('connector', 'grant', 'revoked', 'connector', true),
  define('artifact', 'version', 'created', 'artifact', false),
  define('artifact', 'share', 'published', 'artifact', true),
  define('workspace', 'member', 'granted', 'workspace', true),
  define('workspace', 'member', 'revoked', 'workspace', true),
  define('workspace', 'policy', 'changed', 'workspace', true),
  define('billing', 'subscription', 'changed', 'subscription', true),
  define('billing', 'credits', 'exceeded', 'credit-bucket', true),
  define('billing', 'reservation', 'resolved', 'usage-reservation', false),
  define('identity', 'session', 'started', 'audit-event', true),
  define('identity', 'session', 'completed', 'audit-event', true),
  define('identity', 'data', 'exported', 'audit-event', true),
  define('trust', 'egress', 'approved', 'audit-event', true),
  define('trust', 'egress', 'denied', 'audit-event', true),
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
});

export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;

export const DOMAIN_EVENT_SCHEMA_VERSION = 1;
