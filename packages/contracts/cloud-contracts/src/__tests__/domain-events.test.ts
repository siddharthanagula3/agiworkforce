import { CONCEPT_NAMES, DEVELOPER_SESSION_EVENT_KINDS } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  CONCEPTS_WITHOUT_DOMAIN_EVENTS,
  DOMAIN_EVENTS,
  DOMAIN_EVENT_NAMES,
  DOMAIN_EVENT_SCHEMA_VERSION,
  DOMAIN_EVENT_VERBS,
  DomainEventEnvelopeSchema,
  domainEventName,
  domainEventsForConcept,
  findDomainEvent,
  isDomainEventName,
} from '../domain-events';

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
