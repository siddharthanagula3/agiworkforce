import 'server-only';

import { after } from 'next/server';

import type { DecisionRequest } from '@agiworkforce/agent-core';

import { DECISION_FLAG_PREFIX } from '@/lib/feature-flags/decision-flags';
import type { FlagEvaluation } from '@/lib/feature-flags/evaluate-flags';
import type { FlagDefinition } from '@/lib/feature-flags/flag-definition';
import {
  buildFlagSubject,
  evaluateFlagsForSubject,
} from '@/lib/feature-flags/flag-evaluation-service';
import { getActiveFlagDefinitions } from '@/lib/feature-flags/flag-store';
import { logger } from '@/lib/logger';

import { readDecisionTransportConfig, type DecisionTransportState } from './config';
import type { DecisionEligibilityFacts } from './eligibility';
import {
  evaluateSemanticDecision,
  openDecisionGate,
  type DecisionGate,
  type SemanticDecisionResult,
} from './host';
import type { DecisionKind, DecisionSkipReason } from './kinds';
import { resolveDecisionMode } from './policy';

/**
 * The eligibility and subject facts one turn carries, read once where they are
 * all known and handed to whichever consumer runs later.
 */
export interface SemanticDecisionScope extends DecisionEligibilityFacts {
  request: Request;
  requestId: string;
  userId: string;
  plan: string | null;
  surface: string;
}

export function decisionIdFor(kind: DecisionKind, requestId: string): string {
  return `${kind}:${requestId}`;
}

interface DecisionTurnState {
  nowMs: number;
  transport: DecisionTransportState;
  evaluations: Readonly<Record<string, FlagEvaluation>>;
  definitions: readonly FlagDefinition[];
}

// Keyed by the turn's own scope object, so nothing outlives the turn and two
// turns in one process never share an answer.
const turnStates = new WeakMap<SemanticDecisionScope, Promise<DecisionTurnState>>();

async function readTurnState(scope: SemanticDecisionScope): Promise<DecisionTurnState> {
  const subject = buildFlagSubject(scope.request, {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    role: null,
    plan: scope.plan,
    surface: scope.surface,
  });
  const nowMs = Date.now();
  const [evaluations, definitions] = await Promise.all([
    evaluateFlagsForSubject(subject, { keyPrefix: DECISION_FLAG_PREFIX }, nowMs),
    getActiveFlagDefinitions(nowMs),
  ]);
  return { nowMs, transport: readDecisionTransportConfig(), evaluations, definitions };
}

// Lazily and once per turn: a turn that schedules nothing reads nothing, and
// four kinds that do schedule share one read of the flag store between them.
function turnState(scope: SemanticDecisionScope): Promise<DecisionTurnState> {
  const existing = turnStates.get(scope);
  if (existing) return existing;
  const created = readTurnState(scope);
  turnStates.set(scope, created);
  return created;
}

/**
 * Asked first by every consumer, before any candidate is partitioned, any byte
 * counted or any question written. A closed gate costs one flag read a turn.
 */
export async function decisionGate(
  scope: SemanticDecisionScope,
  kind: DecisionKind,
): Promise<DecisionGate> {
  const state = await turnState(scope);
  return openDecisionGate({
    kind,
    transport: state.transport,
    resolution: resolveDecisionMode({
      kind,
      evaluations: state.evaluations,
      definitions: state.definitions,
      bucketId: scope.userId,
      nowMs: state.nowMs,
    }),
    eligibility: {
      privacyMode: scope.privacyMode,
      workspaceId: scope.workspaceId,
      zeroDataRetentionOnly: scope.zeroDataRetentionOnly,
      workspaceModelPolicy: scope.workspaceModelPolicy,
      residencyRegion: scope.residencyRegion,
    },
  });
}

// One place that calls the host, so a consumer is only its own question,
// interpreter and record.
export async function runShadowDecision(input: {
  kind: DecisionKind;
  scope: SemanticDecisionScope;
  gate: Extract<DecisionGate, { asks: true }>;
  request: DecisionRequest;
  precondition?: DecisionSkipReason | undefined;
}): Promise<SemanticDecisionResult> {
  return evaluateSemanticDecision({
    kind: input.kind,
    request: input.request,
    gate: input.gate,
    context: {
      requestId: input.scope.requestId,
      decisionId: decisionIdFor(input.kind, input.scope.requestId),
      userId: input.scope.userId,
      organizationId: input.scope.workspaceId,
      surface: input.scope.surface,
      precondition: input.precondition,
    },
  });
}

export function swallowShadowFailure(kind: DecisionKind, requestId: string) {
  return (error: unknown) => {
    try {
      logger.warn({ error, kind, requestId }, '[semantic-decisions] shadow failed');
    } catch {
      /* A failed log must not turn a dropped shadow into an unhandled rejection. */
    }
  };
}

// `after` holds the invocation open past the response flush, which a detached
// promise does not. A callback, so nothing starts where `after` itself throws.
export function scheduleShadow(
  kind: DecisionKind,
  requestId: string,
  work: () => Promise<void>,
): void {
  const swallow = swallowShadowFailure(kind, requestId);
  try {
    after(() => work().catch(swallow));
  } catch (error) {
    swallow(error);
  }
}
