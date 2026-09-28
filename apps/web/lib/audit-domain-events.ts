import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  createDomainEventEnvelope,
  findDomainEvent,
  type DomainEventEnvelope,
} from '@agiworkforce/cloud-contracts';
import type { AuditEventType, AuditOutcome } from './security-audit';

interface AuditedDomainEvent {
  readonly name: string;
  readonly outcomes: readonly AuditOutcome[];
}

const SUCCEEDED: readonly AuditOutcome[] = ['success'];

export const AUDITED_DOMAIN_EVENTS: Readonly<Partial<Record<AuditEventType, AuditedDomainEvent>>> =
  Object.freeze({
    login: { name: 'identity.session.started', outcomes: SUCCEEDED },
    logout: { name: 'identity.session.completed', outcomes: SUCCEEDED },
    data_exported: { name: 'identity.data.exported', outcomes: SUCCEEDED },
    member_joined: { name: 'workspace.member.granted', outcomes: SUCCEEDED },
    scim_membership_granted: { name: 'workspace.member.granted', outcomes: SUCCEEDED },
    sso_jit_membership_granted: { name: 'workspace.member.granted', outcomes: SUCCEEDED },
    member_removed: { name: 'workspace.member.revoked', outcomes: SUCCEEDED },
    scim_membership_revoked: { name: 'workspace.member.revoked', outcomes: SUCCEEDED },
    admin_policy_changed: { name: 'workspace.policy.changed', outcomes: SUCCEEDED },
    plan_changed: { name: 'billing.subscription.changed', outcomes: SUCCEEDED },
    spend_cap_exceeded: { name: 'billing.credits.exceeded', outcomes: ['success', 'denied'] },
    connector_added: { name: 'connector.grant.granted', outcomes: SUCCEEDED },
    connector_removed: { name: 'connector.grant.revoked', outcomes: SUCCEEDED },
    skill_installed: { name: 'skill.install.completed', outcomes: SUCCEEDED },
    provider_egress_refused: { name: 'trust.egress.denied', outcomes: ['denied'] },
  });

export interface AuditDomainEventInput {
  eventType: AuditEventType;
  outcome: AuditOutcome;
  userId: string | null;
  organizationId: string | null;
  resourceId: string | null;
  occurredAt: string;
  correlationId?: string;
  causationId?: string;
  operationRef?: string;
}

export function auditDomainEvent(input: AuditDomainEventInput): DomainEventEnvelope | null {
  const audited = AUDITED_DOMAIN_EVENTS[input.eventType];
  if (!audited || !audited.outcomes.includes(input.outcome)) return null;
  const definition = findDomainEvent(audited.name);
  if (!definition) return null;
  const eventId = randomUUID();
  return createDomainEventEnvelope({
    eventId,
    name: definition.name,
    occurredAt: input.occurredAt,
    subject: { concept: definition.concept, id: input.resourceId || eventId },
    actor: { userId: input.userId, organizationId: input.organizationId },
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.operationRef ? { operationRef: input.operationRef } : {}),
  });
}

export function domainEventAuditFields(
  envelope: DomainEventEnvelope | null,
): Record<string, unknown> {
  if (!envelope) return {};
  return {
    domain_event: envelope.name,
    domain_event_id: envelope.eventId,
    domain_event_data_class: envelope.dataClass,
  };
}
