import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  AUDIT_RETENTION_CLASSES,
  CONCEPT_NAMES,
  DEVELOPER_SESSION_EVENT_KINDS,
} from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  CONCEPTS_WITHOUT_DOMAIN_EVENTS,
  DOMAIN_EVENTS,
  DOMAIN_EVENT_CONSUMERS,
  DOMAIN_EVENT_DATA_CLASSES,
  DOMAIN_EVENT_NAMES,
  DOMAIN_EVENT_SCHEMA_VERSION,
  DOMAIN_EVENT_VERBS,
  DomainEventEnvelopeSchema,
  assertDomainEventUnchanged,
  createDomainEventEnvelope,
  domainEventFingerprint,
  domainEventName,
  domainEventsForConcept,
  findDomainEvent,
  isDomainEventName,
} from '../domain-events';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');

/**
 * The developer-session namespace predates the convention. Each member listed
 * here is debt with a reason, and the list may only shrink.
 */
const LEGACY_SESSION_EVENT_KINDS = new Set<string>(DEVELOPER_SESSION_EVENT_KINDS);

describe('naming convention', () => {
  it('accepts a name built by the helper and rejects anything else', () => {
    expect(domainEventName('chat', 'conversation', 'created')).toBe('chat.conversation.created');
    expect(isDomainEventName('chat.conversation.created')).toBe(true);
    expect(isDomainEventName('chat.conversation.remove')).toBe(false);
    expect(isDomainEventName('Chat.Conversation.Created')).toBe(false);
    expect(isDomainEventName('chat.created')).toBe(false);
    expect(isDomainEventName('chat.conversation.sub.created')).toBe(false);
    expect(isDomainEventName('chat_conversation_created')).toBe(false);
  });

  it('refuses to mint a name outside the convention', () => {
    expect(() =>
      domainEventName('chat', 'conversation', 'removed' as (typeof DOMAIN_EVENT_VERBS)[number]),
    ).toThrow(/does not follow/);
  });

  it('has one verb per meaning, with no synonym pairs', () => {
    const synonyms = [
      ['deleted', 'removed'],
      ['created', 'added'],
      ['completed', 'finished'],
      ['cancelled', 'aborted'],
      ['failed', 'errored'],
    ];
    for (const [canonical, synonym] of synonyms) {
      expect(DOMAIN_EVENT_VERBS).toContain(canonical);
      expect(DOMAIN_EVENT_VERBS).not.toContain(synonym);
    }
  });
});

describe('the catalog', () => {
  it('names every event by the convention and never twice', () => {
    for (const event of DOMAIN_EVENTS) {
      expect(isDomainEventName(event.name), event.name).toBe(true);
      expect(event.name.startsWith(`${event.namespace}.`), event.name).toBe(true);
    }
    expect(new Set(DOMAIN_EVENT_NAMES).size).toBe(DOMAIN_EVENT_NAMES.length);
  });

  it('draws every subject from the concept registry', () => {
    for (const event of DOMAIN_EVENTS) {
      expect(CONCEPT_NAMES, event.name).toContain(event.concept);
    }
  });

  it('is looked up by name', () => {
    expect(findDomainEvent('chat.conversation.deleted')?.consequential).toBe(true);
    expect(findDomainEvent('chat.message.created')?.consequential).toBe(false);
    expect(findDomainEvent('chat.conversation.exploded')).toBeNull();
  });

  it('gives every irreversible act a consequential event', () => {
    const irreversible = [
      'chat.conversation.deleted',
      'chat.conversation.purged',
      'project.project.deleted',
      'memory.entry.deleted',
      'connector.grant.revoked',
      'workspace.member.revoked',
      'identity.data.exported',
    ];
    for (const name of irreversible) {
      expect(findDomainEvent(name)?.consequential, name).toBe(true);
    }
  });

  it('records which concepts still have no event of their own', () => {
    for (const concept of CONCEPTS_WITHOUT_DOMAIN_EVENTS) {
      expect(domainEventsForConcept(concept)).toEqual([]);
    }
    expect(CONCEPTS_WITHOUT_DOMAIN_EVENTS.length).toBeLessThan(CONCEPT_NAMES.length / 2);
  });
});

describe('the envelope', () => {
  const valid = {
    schemaVersion: DOMAIN_EVENT_SCHEMA_VERSION,
    eventId: 'evt_1',
    name: 'chat.conversation.deleted',
    occurredAt: '2026-09-18T00:00:00.000Z',
    correlationId: 'op_1',
    causationId: 'evt_0',
    operationRef: '1:req_a:op_b:att_c',
    subject: { concept: 'conversation' as const, id: 'conv_1' },
    actor: { userId: 'usr_1', organizationId: null },
    retentionClass: 'security' as const,
    dataClass: 'none' as const,
    dedupeKey: 'evt_1',
  };

  it('accepts a complete event and one that starts a chain', () => {
    expect(DomainEventEnvelopeSchema.parse(valid)).toMatchObject({ name: valid.name });
    const { causationId: _causationId, ...root } = valid;
    expect(DomainEventEnvelopeSchema.safeParse(root).success).toBe(true);
  });

  it('refuses a name outside the convention', () => {
    const result = DomainEventEnvelopeSchema.safeParse({
      ...valid,
      name: 'chat.conversation.nuke',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a subject that is not a registered concept', () => {
    const result = DomainEventEnvelopeSchema.safeParse({
      ...valid,
      subject: { concept: 'invoice', id: 'inv_1' },
    });
    expect(result.success).toBe(false);
  });

  it('refuses an envelope from a version it does not know', () => {
    expect(DomainEventEnvelopeSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
  });

  it('refuses an envelope with no retention class, classification or dedupe key', () => {
    for (const field of ['retentionClass', 'dataClass', 'dedupeKey'] as const) {
      const { [field]: _dropped, ...without } = valid;
      expect(DomainEventEnvelopeSchema.safeParse(without).success, field).toBe(false);
    }
  });
});

describe('minting an envelope', () => {
  const base = {
    eventId: 'evt_2',
    name: 'identity.session.started',
    occurredAt: '2026-09-18T00:00:00.000Z',
    subject: { concept: 'audit-event' as const, id: 'ses_1' },
  };

  it('takes retention and classification from the catalog rather than the producer', () => {
    const envelope = createDomainEventEnvelope(base);

    const definition = findDomainEvent(base.name)!;
    expect(envelope.retentionClass).toBe(definition.retentionClass);
    expect(envelope.dataClass).toBe(definition.dataClass);
    expect(envelope.dedupeKey).toBe(base.eventId);
  });

  it('refuses to mint an event the catalog does not name', () => {
    expect(() =>
      createDomainEventEnvelope({ ...base, name: 'chat.conversation.created' }),
    ).not.toThrow();
    expect(() => createDomainEventEnvelope({ ...base, name: 'ghost.thing.created' })).toThrow(
      /not in the catalog/,
    );
  });

  it('lets a producer that may re-raise an event say so, without reusing the id', () => {
    const envelope = createDomainEventEnvelope({ ...base, dedupeKey: 'session:ses_1:started' });
    expect(envelope.dedupeKey).toBe('session:ses_1:started');
    expect(envelope.eventId).toBe('evt_2');
  });
});

describe('an event is written once', () => {
  const envelope = createDomainEventEnvelope({
    eventId: 'evt_3',
    name: 'workspace.policy.changed',
    occurredAt: '2026-09-18T00:00:00.000Z',
    subject: { concept: 'workspace', id: 'ws_1' },
    payload: { setting: 'egress', from: 'open', to: 'restricted' },
  });

  it('fingerprints the same content the same way whatever order it was built in', () => {
    const reordered = {
      ...envelope,
      payload: { to: 'restricted', from: 'open', setting: 'egress' },
    };
    expect(domainEventFingerprint(reordered)).toBe(domainEventFingerprint(envelope));
    expect(() => assertDomainEventUnchanged(envelope, reordered)).not.toThrow();
  });

  it('refuses a second write of the same id that changed what the event says', () => {
    const rewritten = { ...envelope, payload: { setting: 'egress', from: 'open', to: 'open' } };
    expect(() => assertDomainEventUnchanged(envelope, rewritten)).toThrow(/different content/);
  });

  it('refuses to compare two different events at all', () => {
    const other = { ...envelope, eventId: 'evt_4' };
    expect(() => assertDomainEventUnchanged(envelope, other)).toThrow(/different ids/);
  });
});

describe('every event says who owns it, who reads it and what it carries', () => {
  it('names an owner that is a directory in this repository', () => {
    const missing = DOMAIN_EVENTS.filter(
      (event) => !existsSync(path.join(REPO_ROOT, event.owner)),
    ).map((event) => `${event.name} is owned by ${event.owner}, which is not a directory`);
    expect(missing).toEqual([]);
  });

  it('draws every consumer and every class from the closed vocabulary', () => {
    for (const event of DOMAIN_EVENTS) {
      expect(event.consumers.length, event.name).toBeGreaterThan(0);
      for (const consumer of event.consumers) {
        expect(DOMAIN_EVENT_CONSUMERS, event.name).toContain(consumer);
      }
      expect(DOMAIN_EVENT_DATA_CLASSES, event.name).toContain(event.dataClass);
      expect(AUDIT_RETENTION_CLASSES, event.name).toContain(event.retentionClass);
    }
  });

  it('sends every consequential event to the audit log', () => {
    for (const event of DOMAIN_EVENTS.filter((candidate) => candidate.consequential)) {
      expect(event.consumers, event.name).toContain('audit-log');
      expect(event.retentionClass, event.name).not.toBe('operational');
    }
  });

  // A class is a promise about the payload; without the fields it is a label.
  it('names the personal fields of anything classified above operational data', () => {
    for (const event of DOMAIN_EVENTS) {
      if (event.dataClass === 'none' || event.dataClass === 'account') continue;
      expect(event.piiFields.length, event.name).toBeGreaterThan(0);
    }
    for (const event of DOMAIN_EVENTS.filter((candidate) => candidate.dataClass === 'none')) {
      expect(event.piiFields, event.name).toEqual([]);
    }
  });

  it('is documented in full, so the contract and the document cannot drift', () => {
    const doc = readFileSync(path.join(REPO_ROOT, 'docs/standards/domain-events.md'), 'utf8');
    const undocumented = DOMAIN_EVENTS.filter((event) => !doc.includes(event.name)).map(
      (event) => event.name,
    );
    expect(undocumented).toEqual([]);
    for (const term of [...DOMAIN_EVENT_DATA_CLASSES, ...DOMAIN_EVENT_CONSUMERS]) {
      expect(doc, term).toContain(term);
    }
    expect(doc).toContain(`DOMAIN_EVENT_SCHEMA_VERSION`);
  });
});

describe('the namespace that predates the convention', () => {
  it('is tracked rather than silently exempt', () => {
    const conforming = [...LEGACY_SESSION_EVENT_KINDS].filter(isDomainEventName);
    expect(conforming).toEqual([]);
    expect(LEGACY_SESSION_EVENT_KINDS.size).toBeGreaterThan(0);
  });

  it('shares no name with the catalog, so the two cannot be confused', () => {
    for (const name of DOMAIN_EVENT_NAMES) {
      expect(LEGACY_SESSION_EVENT_KINDS.has(name), name).toBe(false);
    }
  });
});
