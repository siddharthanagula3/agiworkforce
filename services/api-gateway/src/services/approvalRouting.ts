/**
 * @file Approval Routing Service
 *
 * Determines who should receive an approval request and in what order.
 * This is a pure logic module -- actual notification delivery (push, WebSocket,
 * email) is handled by the notification layer.
 *
 * Routing rules (in priority order):
 *   1. Resource owner (the user who started the agent)
 *   2. Team admins
 *   3. Team members with `can_approve` permission
 *
 * If the primary approver does not respond within the escalation timeout,
 * the request is escalated to the next approver in the chain.
 *
 * @module approvalRouting
 */

import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Priority level for an approval request. */
export type ApprovalPriority = 'normal' | 'urgent';

/** A request for tool-call approval that needs to be routed. */
export interface ApprovalRequest {
  /** Unique ID of the approval request. */
  requestId: string;
  /** The tool being invoked. */
  toolName: string;
  /** Risk level from ToolGuard. */
  riskLevel: 'safe' | 'unknown' | 'dangerous';
  /** ID of the agent session that triggered the request. */
  agentSessionId: string;
  /** ISO 8601 timestamp when the request was created. */
  createdAt: string;
}

/** Result of routing an approval request. */
export interface ApprovalRoutingResult {
  /** Ordered list of user IDs who should receive the approval request. */
  approvers: string[];
  /** Milliseconds before escalating to the next approver in the chain. */
  escalationTimeoutMs: number;
  /** Priority classification for the approval. */
  priority: ApprovalPriority;
}

/** A team member's role and permissions relevant to approval routing. */
export interface TeamMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  /** Whether this member has permission to approve tool calls. */
  canApprove: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default escalation timeout: 2 minutes. */
const DEFAULT_ESCALATION_TIMEOUT_MS = 2 * 60 * 1000;

/** Escalation timeout for urgent approvals: 1 minute. */
const URGENT_ESCALATION_TIMEOUT_MS = 1 * 60 * 1000;

/** Escalation timeout when no team is configured (solo user): 5 minutes. */
const SOLO_ESCALATION_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// In-memory team roster (replace with DB-backed store in production)
// ---------------------------------------------------------------------------

const teamRosters = new Map<string, TeamMember[]>();

/** Register or update a team roster. Called by team management endpoints. */
export function setTeamRoster(teamId: string, members: TeamMember[]): void {
  teamRosters.set(teamId, members);
  logger.info({ teamId, memberCount: members.length }, 'Team roster updated');
}

/** Retrieve the current team roster, if any. */
export function getTeamRoster(teamId: string): TeamMember[] | undefined {
  return teamRosters.get(teamId);
}

// ---------------------------------------------------------------------------
// Priority classification
// ---------------------------------------------------------------------------

/**
 * Classify the priority of an approval request.
 *
 * Dangerous tools get urgent priority. Everything else is normal.
 */
function classifyPriority(request: ApprovalRequest): ApprovalPriority {
  if (request.riskLevel === 'dangerous') {
    return 'urgent';
  }
  return 'normal';
}

// ---------------------------------------------------------------------------
// Core routing logic
// ---------------------------------------------------------------------------

/**
 * Route an approval request to the appropriate approvers.
 *
 * The returned `approvers` array is ordered by priority:
 *   1. The resource owner (userId) -- always first
 *   2. Team admins (if teamId is provided)
 *   3. Team members with `canApprove` permission
 *
 * Duplicates are removed (the owner may also be an admin).
 *
 * If no team is configured, the owner is the sole approver with a longer
 * escalation timeout since there is nobody to escalate to.
 *
 * @param userId  - The user who owns the agent / started the task.
 * @param teamId  - Optional team ID. When provided, team members are included.
 * @param request - The approval request to route.
 */
export function routeApproval(
  userId: string,
  teamId: string | undefined,
  request: ApprovalRequest,
): ApprovalRoutingResult {
  const priority = classifyPriority(request);
  const seen = new Set<string>();
  const approvers: string[] = [];

  // Helper: add a user if not already in the list
  const addApprover = (uid: string): void => {
    if (!seen.has(uid)) {
      seen.add(uid);
      approvers.push(uid);
    }
  };

  // 1. Owner always comes first
  addApprover(userId);

  // 2. Team-based routing
  if (teamId) {
    const roster = teamRosters.get(teamId);
    if (roster && roster.length > 0) {
      // Add team owners first
      for (const member of roster) {
        if (member.role === 'owner') {
          addApprover(member.userId);
        }
      }

      // Then team admins
      for (const member of roster) {
        if (member.role === 'admin') {
          addApprover(member.userId);
        }
      }

      // Then members with approval permission
      for (const member of roster) {
        if (member.role === 'member' && member.canApprove) {
          addApprover(member.userId);
        }
      }
    } else {
      logger.warn({ teamId }, 'Team roster not found or empty; falling back to owner-only routing');
    }
  }

  // Determine escalation timeout
  let escalationTimeoutMs: number;
  if (approvers.length <= 1) {
    // Solo user -- longer timeout since there is nobody to escalate to
    escalationTimeoutMs = SOLO_ESCALATION_TIMEOUT_MS;
  } else if (priority === 'urgent') {
    escalationTimeoutMs = URGENT_ESCALATION_TIMEOUT_MS;
  } else {
    escalationTimeoutMs = DEFAULT_ESCALATION_TIMEOUT_MS;
  }

  logger.debug(
    {
      userId,
      teamId,
      requestId: request.requestId,
      toolName: request.toolName,
      approverCount: approvers.length,
      priority,
      escalationTimeoutMs,
    },
    'Approval request routed',
  );

  return {
    approvers,
    escalationTimeoutMs,
    priority,
  };
}
