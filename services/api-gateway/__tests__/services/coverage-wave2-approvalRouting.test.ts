/**
 * Coverage wave 2 — approvalRouting service.
 *
 * Exercises the previously-untested approver-chain builder in
 * `src/services/approvalRouting.ts`. The module decides who receives a tool-call
 * approval request and the escalation timeout, ordering approvers as:
 * owner → team owners → team admins → members with `canApprove`, deduplicated,
 * and selecting an escalation timeout from solo / urgent / normal cases.
 *
 * Assertions cover ordering, dedup, priority classification, and the three
 * timeout branches — genuine behavior, not a smoke import.
 */
import { describe, expect, it } from 'vitest';
import {
  routeApproval,
  setTeamRoster,
  type ApprovalRequest,
  type TeamMember,
} from '../../src/services/approvalRouting';

let counter = 0;
function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}`;
}

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: uniqueId('req'),
    toolName: 'fs__write',
    riskLevel: 'unknown',
    agentSessionId: uniqueId('sess'),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Solo / urgent / default timeouts as defined in the module.
const SOLO_TIMEOUT = 5 * 60 * 1000;
const URGENT_TIMEOUT = 1 * 60 * 1000;
const DEFAULT_TIMEOUT = 2 * 60 * 1000;

describe('approvalRouting.routeApproval', () => {
  it('routes a solo user (no team) to themselves with the long solo timeout', () => {
    const userId = uniqueId('owner');
    const result = routeApproval(userId, undefined, makeRequest());

    expect(result.approvers).toEqual([userId]);
    expect(result.priority).toBe('normal');
    // Nobody to escalate to → long solo timeout.
    expect(result.escalationTimeoutMs).toBe(SOLO_TIMEOUT);
  });

  it('falls back to owner-only with solo timeout when the teamId has no roster', () => {
    const userId = uniqueId('owner');
    // teamId provided but never registered via setTeamRoster.
    const result = routeApproval(userId, uniqueId('ghost-team'), makeRequest());

    expect(result.approvers).toEqual([userId]);
    expect(result.escalationTimeoutMs).toBe(SOLO_TIMEOUT);
  });

  it('orders approvers owner → team-owner → admin → approving-member and dedups the owner', () => {
    const ownerId = uniqueId('owner');
    const teamId = uniqueId('team');
    const teamOwner = uniqueId('towner');
    const admin = uniqueId('admin');
    const approver = uniqueId('member-yes');
    const nonApprover = uniqueId('member-no');

    const roster: TeamMember[] = [
      // Intentionally out of order, and the resource owner is also listed as a
      // member to verify dedup keeps them only once (at the front).
      { userId: nonApprover, role: 'member', canApprove: false },
      { userId: approver, role: 'member', canApprove: true },
      { userId: admin, role: 'admin', canApprove: false },
      { userId: ownerId, role: 'member', canApprove: true },
      { userId: teamOwner, role: 'owner', canApprove: true },
    ];
    setTeamRoster(teamId, roster);

    const result = routeApproval(ownerId, teamId, makeRequest());

    // Resource owner first, then team owner, admin, approving member.
    expect(result.approvers).toEqual([ownerId, teamOwner, admin, approver]);
    // The non-approving member is excluded entirely.
    expect(result.approvers).not.toContain(nonApprover);
    // Owner appears exactly once despite also being a roster member.
    expect(result.approvers.filter((u) => u === ownerId)).toHaveLength(1);
  });

  it('classifies dangerous tools as urgent and uses the short escalation timeout', () => {
    const ownerId = uniqueId('owner');
    const teamId = uniqueId('team');
    setTeamRoster(teamId, [{ userId: uniqueId('admin'), role: 'admin', canApprove: true }]);

    const result = routeApproval(ownerId, teamId, makeRequest({ riskLevel: 'dangerous' }));

    expect(result.priority).toBe('urgent');
    // More than one approver + urgent → short urgent timeout.
    expect(result.approvers.length).toBeGreaterThan(1);
    expect(result.escalationTimeoutMs).toBe(URGENT_TIMEOUT);
  });

  it('uses the default timeout for a non-urgent request that has multiple approvers', () => {
    const ownerId = uniqueId('owner');
    const teamId = uniqueId('team');
    setTeamRoster(teamId, [{ userId: uniqueId('admin'), role: 'admin', canApprove: true }]);

    const result = routeApproval(ownerId, teamId, makeRequest({ riskLevel: 'unknown' }));

    expect(result.priority).toBe('normal');
    expect(result.approvers.length).toBeGreaterThan(1);
    expect(result.escalationTimeoutMs).toBe(DEFAULT_TIMEOUT);
  });

  it('keeps the solo timeout for an urgent request when the owner is the only approver', () => {
    const ownerId = uniqueId('owner');
    const teamId = uniqueId('team');
    // Roster contains only the owner → after dedup, just one approver.
    setTeamRoster(teamId, [{ userId: ownerId, role: 'owner', canApprove: true }]);

    const result = routeApproval(ownerId, teamId, makeRequest({ riskLevel: 'dangerous' }));

    expect(result.priority).toBe('urgent');
    expect(result.approvers).toEqual([ownerId]);
    // Solo-timeout branch (approvers.length <= 1) takes precedence over urgent.
    expect(result.escalationTimeoutMs).toBe(SOLO_TIMEOUT);
  });
});
