/**
 * @file Approval Policy Service
 *
 * Evaluates whether a tool call requires user approval based on team and user
 * policies. Emits an audit event for every policy evaluation.
 *
 * Policy levels (checked in priority order):
 *   1. Team override (set by team admin) — highest priority
 *   2. User-level policy — per-user tool settings
 *   3. Default policy — falls back to risk-level-based decision
 *
 * @module approvalPolicy
 */

import { logger } from '../lib/logger';

type AuditSurface = 'desktop' | 'mobile' | 'web' | 'cli' | 'vscode';
type AuditAction =
  | 'auth_login'
  | 'auth_logout'
  | 'tool_approved'
  | 'tool_denied'
  | 'tool_timeout'
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_paused'
  | 'agent_cancelled'
  | 'settings_changed'
  | 'data_exported'
  | 'data_deleted';
type AuditSeverity = 'info' | 'warning' | 'critical';
type AuditOutcome = 'success' | 'failure' | 'denied';

interface AuditEvent {
  eventId: string;
  timestamp: string;
  userId: string | null;
  surface: AuditSurface;
  action: AuditAction;
  resource: string;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  metadata?: Record<string, unknown>;
}

function defaultSeverityForAction(action: AuditAction): AuditSeverity {
  switch (action) {
    case 'tool_denied':
    case 'tool_timeout':
    case 'agent_failed':
      return 'warning';
    case 'data_deleted':
      return 'critical';
    default:
      return 'info';
  }
}

function createAuditEvent(
  params: Omit<AuditEvent, 'eventId' | 'timestamp' | 'severity'> & {
    eventId?: string;
    timestamp?: string;
    severity?: AuditSeverity;
  },
): AuditEvent {
  return {
    eventId: params.eventId ?? crypto.randomUUID(),
    timestamp: params.timestamp ?? new Date().toISOString(),
    severity: params.severity ?? defaultSeverityForAction(params.action),
    userId: params.userId,
    surface: params.surface,
    action: params.action,
    resource: params.resource,
    outcome: params.outcome,
    metadata: params.metadata,
  };
}

export type RiskLevel = 'safe' | 'unknown' | 'dangerous';

export type PolicyDecision = 'approve' | 'require_approval' | 'deny';

export type PolicySource = 'user' | 'team' | 'default';

export interface ApprovalPolicyResult {
  decision: PolicyDecision;
  reason: string;
  policySource: PolicySource;
}

export interface ToolPolicy {
  toolName: string;
  decision: PolicyDecision;
}

export interface TeamPolicy {
  teamId: string;
  toolOverrides: Record<string, PolicyDecision>;
  enforced: boolean;
}

export interface UserPolicy {
  userId: string;
  toolOverrides: Record<string, PolicyDecision>;
}

const teamPolicies = new Map<string, TeamPolicy>();
const userPolicies = new Map<string, UserPolicy>();

export function setTeamPolicy(policy: TeamPolicy): void {
  teamPolicies.set(policy.teamId, policy);
  logger.info(
    { teamId: policy.teamId, tools: Object.keys(policy.toolOverrides).length },
    'Team policy updated',
  );
}

export function setUserPolicy(policy: UserPolicy): void {
  userPolicies.set(policy.userId, policy);
}

export function getTeamPolicy(teamId: string): TeamPolicy | undefined {
  return teamPolicies.get(teamId);
}

export function getUserPolicy(userId: string): UserPolicy | undefined {
  return userPolicies.get(userId);
}

type AuditListener = (event: AuditEvent) => void;
const auditListeners: AuditListener[] = [];

export function onAuditEvent(listener: AuditListener): void {
  auditListeners.push(listener);
}

function emitAudit(event: AuditEvent): void {
  for (const listener of auditListeners) {
    try {
      listener(event);
    } catch (err) {
      logger.error({ err }, 'Audit listener threw');
    }
  }
}

function defaultDecisionForRisk(riskLevel: RiskLevel): PolicyDecision {
  switch (riskLevel) {
    case 'safe':
      return 'approve';
    case 'unknown':
      return 'require_approval';
    case 'dangerous':
      return 'require_approval';
  }
}

/**
 * Evaluate the approval policy for a tool call.
 *
 * Resolution order:
 *   1. Team policy override for the specific tool (if the user belongs to a team).
 *   2. User policy override for the specific tool.
 *   3. Default risk-level-based decision.
 *
 * An audit event is emitted for every evaluation regardless of outcome.
 *
 * @param userId   - The authenticated user requesting the tool call.
 * @param toolName - The canonical tool name (e.g., `mcp__filesystem__write_file`).
 * @param riskLevel - Risk classification from ToolGuard.
 * @param teamId   - Optional team ID if the user belongs to a team.
 */
export function evaluateApprovalPolicy(
  userId: string,
  toolName: string,
  riskLevel: RiskLevel,
  teamId?: string,
): ApprovalPolicyResult {
  let result: ApprovalPolicyResult;

  if (teamId) {
    const team = teamPolicies.get(teamId);
    if (team) {
      const teamDecision = team.toolOverrides[toolName];
      if (teamDecision !== undefined) {
        result = {
          decision: teamDecision,
          reason: `Team policy (${teamId}) sets "${toolName}" to "${teamDecision}"`,
          policySource: 'team',
        };
        emitPolicyAudit(userId, toolName, riskLevel, result, teamId);
        return result;
      }
    }
  }

  const user = userPolicies.get(userId);
  if (user) {
    const userDecision = user.toolOverrides[toolName];
    if (userDecision !== undefined) {
      result = {
        decision: userDecision,
        reason: `User policy sets "${toolName}" to "${userDecision}"`,
        policySource: 'user',
      };
      emitPolicyAudit(userId, toolName, riskLevel, result, teamId);
      return result;
    }
  }

  const defaultDecision = defaultDecisionForRisk(riskLevel);
  result = {
    decision: defaultDecision,
    reason: `Default policy: risk level "${riskLevel}" maps to "${defaultDecision}"`,
    policySource: 'default',
  };
  emitPolicyAudit(userId, toolName, riskLevel, result, teamId);
  return result;
}

function emitPolicyAudit(
  userId: string,
  toolName: string,
  riskLevel: RiskLevel,
  result: ApprovalPolicyResult,
  teamId?: string,
): void {
  const actionMap: Record<PolicyDecision, 'tool_approved' | 'tool_denied' | 'tool_approved'> = {
    approve: 'tool_approved',
    require_approval: 'tool_approved', // Not yet denied; pending human review
    deny: 'tool_denied',
  };

  const event = createAuditEvent({
    userId,
    surface: 'desktop',
    action: actionMap[result.decision],
    resource: toolName,
    outcome: result.decision === 'deny' ? 'denied' : 'success',
    metadata: {
      riskLevel,
      policyDecision: result.decision,
      policySource: result.policySource,
      reason: result.reason,
      teamId: teamId ?? null,
    },
  });

  emitAudit(event);

  logger.debug(
    {
      userId,
      toolName,
      riskLevel,
      decision: result.decision,
      policySource: result.policySource,
    },
    'Approval policy evaluated',
  );
}
