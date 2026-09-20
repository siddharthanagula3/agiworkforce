import 'server-only';

import { NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { WorkspaceCodeControls } from '@agiworkforce/types';

import { recordAuditEvent, type AuditEventType } from '@/lib/security-audit';
import { resolveEffectiveWorkspaceControls } from '@/lib/services/organization-policy-gate';
import {
  evaluateWorkspaceCodeAct,
  type WorkspaceCodeAct,
  type WorkspaceCodeDecision,
} from '@/lib/services/organization-policy-evaluator';

interface ScopedRequest {
  headers: { get(name: string): string | null };
}

export interface WorkspaceCodeGateResult extends WorkspaceCodeDecision {
  organizationId: string | null;
}

/**
 * The one place a Code surface asks whether an act is permitted.
 *
 * The controls come from the single resolver, so a role, group, project, device
 * or person layer narrows them here exactly as it does everywhere else. A
 * personal workspace and an organization that never saved a policy resolve to
 * no controls and are allowed, which is every workspace today. An unreadable
 * policy throws out of the resolver as `workspace_policy_unavailable`, the same
 * 503 the other controls answer with, so Code fails closed the way they do.
 */
export async function evaluateWorkspaceCodeAccess(
  db: DatabaseAdapter,
  userId: string,
  act: WorkspaceCodeAct,
  request?: ScopedRequest,
): Promise<WorkspaceCodeGateResult> {
  const effective = await resolveEffectiveWorkspaceControls(db, userId, request);
  const controls: WorkspaceCodeControls | null = effective?.code ?? null;
  return {
    ...evaluateWorkspaceCodeAct(controls, act),
    organizationId: effective?.organizationId ?? null,
  };
}

// There is no one event type for "a workspace policy refused this", so each act
// is recorded under the existing type that describes what it was refused from.
const REFUSAL_EVENT: Readonly<Record<WorkspaceCodeAct['act'], AuditEventType>> = Object.freeze({
  open_cloud_session: 'code_session_lifecycle_changed',
  connect_github: 'connector_setting_changed',
  review_pull_request: 'connector_setting_changed',
  use_mcp_server: 'provider_egress_refused',
  reach_host: 'provider_egress_refused',
});

async function auditRefusal(
  userId: string,
  decision: WorkspaceCodeGateResult,
  act: WorkspaceCodeAct,
  request?: Request,
): Promise<void> {
  await recordAuditEvent({
    userId,
    organizationId: decision.organizationId,
    eventType: REFUSAL_EVENT[act.act],
    outcome: 'denied',
    severity: 'warning',
    ...(request ? { request } : {}),
    detail: {
      resourceType: 'workspace_code_control',
      resourceId: decision.control ?? act.act,
      scope: 'workspace',
      reason: decision.code,
      status: act.act,
    },
  });
}

/**
 * The refusal a route returns, in the shape every other workspace policy
 * refusal uses, with a sentence the person reading it can act on. Returns null
 * when the act is permitted, so a call site is one `if` and never a comparison
 * against a control key.
 */
export async function buildWorkspaceCodeGateResponse(
  db: DatabaseAdapter,
  userId: string,
  act: WorkspaceCodeAct,
  request?: Request & ScopedRequest,
): Promise<NextResponse | null> {
  const decision = await evaluateWorkspaceCodeAccess(db, userId, act, request);
  if (decision.allowed) return null;

  await auditRefusal(userId, decision, act, request);

  return NextResponse.json(
    {
      error: {
        message: decision.reason,
        type: 'organization_policy',
        code: decision.code,
        control: decision.control,
      },
    },
    { status: 403 },
  );
}

/**
 * For a caller that is not answering an HTTP request, such as the webhook that
 * decides whether to review a pull request at all. Same decision, same trail.
 */
export async function assertWorkspaceCodeAccess(
  db: DatabaseAdapter,
  userId: string,
  act: WorkspaceCodeAct,
): Promise<WorkspaceCodeGateResult> {
  const decision = await evaluateWorkspaceCodeAccess(db, userId, act);
  if (!decision.allowed) await auditRefusal(userId, decision, act);
  return decision;
}
