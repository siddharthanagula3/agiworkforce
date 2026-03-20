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

// ---------------------------------------------------------------------------
// Audit types (mirrors AuditEvent from packages/types/src/audit.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Risk level assigned to a tool by ToolGuard or the caller. */
export type RiskLevel = 'safe' | 'unknown' | 'dangerous';

/** The three possible policy decisions. */
export type PolicyDecision = 'approve' | 'require_approval' | 'deny';

/** Where the policy decision originated. */
export type PolicySource = 'user' | 'team' | 'default';

/** Result of evaluating a tool's approval policy. */
export interface ApprovalPolicyResult {
  /** The decision: auto-approve, require human approval, or deny outright. */
  decision: PolicyDecision;
  /** Human-readable explanation of why this decision was made. */
  reason: string;
  /** Which policy layer produced this decision. */
  policySource: PolicySource;
}

/** A single per-tool policy entry. */
export interface ToolPolicy {
  toolName: string;
  decision: PolicyDecision;
}

/** Team-level policy overrides set by an admin. */
export interface TeamPolicy {
  teamId: string;
  /** Per-tool overrides. Keyed by tool name for fast lookup. */
  toolOverrides: Record<string, PolicyDecision>;
  /** If true, team policy takes absolute precedence (user cannot override). */
  enforced: boolean;
}

/** User-level per-tool policies. */
export interface UserPolicy {
  userId: string;
  toolOverrides: Record<string, PolicyDecision>;
}

// ---------------------------------------------------------------------------
// In-memory policy store (replace with DB-backed store in production)
// ---------------------------------------------------------------------------

const teamPolicies = new Map<string, TeamPolicy>();
const userPolicies = new Map<string, UserPolicy>();

/** Register or update a team policy. Intended for team admin endpoints. */
export function setTeamPolicy(policy: TeamPolicy): void {
  teamPolicies.set(policy.teamId, policy);
  logger.info(
    { teamId: policy.teamId, tools: Object.keys(policy.toolOverrides).length },
    'Team policy updated',
  );
}

/** Register or update a user policy. */
export function setUserPolicy(policy: UserPolicy): void {
  userPolicies.set(policy.userId, policy);
}

/** Retrieve the current team policy, if any. */
export function getTeamPolicy(teamId: string): TeamPolicy | undefined {
  return teamPolicies.get(teamId);
}

/** Retrieve the current user policy, if any. */
export function getUserPolicy(userId: string): UserPolicy | undefined {
  return userPolicies.get(userId);
}

// ---------------------------------------------------------------------------
// Audit emission
// ---------------------------------------------------------------------------

/** Listeners that receive every audit event emitted by this module. */
type AuditListener = (event: AuditEvent) => void;
const auditListeners: AuditListener[] = [];

/** Register a listener that will be called for every policy evaluation audit event. */
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

// ---------------------------------------------------------------------------
// Default risk-based policy
// ---------------------------------------------------------------------------

/**
 * Map a risk level to a default policy decision.
 *
 * - `safe`      -> `approve`           (trusted, no approval needed)
 * - `unknown`   -> `require_approval`  (needs human review)
 * - `dangerous` -> `require_approval`  (needs human review; not denied by default
 *                                        so users can still approve after review)
 */
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

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

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

  // 1. Check team policy
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

  // 2. Check user policy
  const user = userPolicies.get(userId);
  if (user) {
    const userDecision = user.toolOverrides[toolName];
    if (userDecision !== undefined) {
      // If team policy is enforced and exists (but didn't have this specific tool),
      // user policy still applies for unlisted tools.
      result = {
        decision: userDecision,
        reason: `User policy sets "${toolName}" to "${userDecision}"`,
        policySource: 'user',
      };
      emitPolicyAudit(userId, toolName, riskLevel, result, teamId);
      return result;
    }
  }

  // 3. Fall back to risk-based default
  const defaultDecision = defaultDecisionForRisk(riskLevel);
  result = {
    decision: defaultDecision,
    reason: `Default policy: risk level "${riskLevel}" maps to "${defaultDecision}"`,
    policySource: 'default',
  };
  emitPolicyAudit(userId, toolName, riskLevel, result, teamId);
  return result;
}

// ---------------------------------------------------------------------------
// Audit event creation
// ---------------------------------------------------------------------------

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
