/**
 * Coverage wave 2 — approvalPolicy service.
 *
 * Exercises the previously-untested policy resolution engine in
 * `src/services/approvalPolicy.ts`. The module decides whether a tool call is
 * auto-approved, needs human review, or is denied, resolving in this priority
 * order: team override → user override → risk-based default. It also emits an
 * audit event for every evaluation.
 *
 * These assertions cover real branching behavior (precedence, audit shape,
 * risk→decision mapping), not a smoke import.
 *
 * Module state note: teamPolicies / userPolicies are module-level Maps with no
 * public reset, so each test uses unique team/user IDs to stay isolated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateApprovalPolicy,
  onAuditEvent,
  setTeamPolicy,
  setUserPolicy,
  type RiskLevel,
} from '../../src/services/approvalPolicy';

let testCounter = 0;
function uniqueId(prefix: string): string {
  testCounter += 1;
  return `${prefix}-${testCounter}-${Date.now()}`;
}

describe('approvalPolicy.evaluateApprovalPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to risk-based defaults when no team or user policy exists', () => {
    const userId = uniqueId('user-default');

    const safe = evaluateApprovalPolicy(userId, 'fs__read', 'safe');
    expect(safe.decision).toBe('approve');
    expect(safe.policySource).toBe('default');

    const unknown = evaluateApprovalPolicy(userId, 'fs__exec', 'unknown');
    expect(unknown.decision).toBe('require_approval');
    expect(unknown.policySource).toBe('default');

    // 'dangerous' is require_approval (NOT auto-deny) so users can still
    // approve after review — guards against a regression to silent denial.
    const dangerous = evaluateApprovalPolicy(userId, 'fs__rm_rf', 'dangerous');
    expect(dangerous.decision).toBe('require_approval');
    expect(dangerous.policySource).toBe('default');
  });

  it('lets a user-level override beat the risk-based default', () => {
    const userId = uniqueId('user-override');
    setUserPolicy({
      userId,
      toolOverrides: { dangerous_tool: 'approve' },
    });

    // Without the override this dangerous tool would be require_approval.
    const result = evaluateApprovalPolicy(userId, 'dangerous_tool', 'dangerous');
    expect(result.decision).toBe('approve');
    expect(result.policySource).toBe('user');
    expect(result.reason).toContain('User policy');

    // A different tool with no override still uses the default path.
    const other = evaluateApprovalPolicy(userId, 'unlisted_tool', 'safe');
    expect(other.policySource).toBe('default');
  });

  it('gives a team override the highest priority, beating a conflicting user override', () => {
    const userId = uniqueId('user');
    const teamId = uniqueId('team');

    // User says approve, team says deny — team must win.
    setUserPolicy({ userId, toolOverrides: { shared_tool: 'approve' } });
    setTeamPolicy({
      teamId,
      toolOverrides: { shared_tool: 'deny' },
      enforced: true,
    });

    const result = evaluateApprovalPolicy(userId, 'shared_tool', 'safe', teamId);
    expect(result.decision).toBe('deny');
    expect(result.policySource).toBe('team');
    expect(result.reason).toContain(teamId);
  });

  it('falls through to the user override for tools the team policy does not list', () => {
    const userId = uniqueId('user');
    const teamId = uniqueId('team');

    setUserPolicy({ userId, toolOverrides: { only_user_tool: 'approve' } });
    setTeamPolicy({
      teamId,
      toolOverrides: { some_other_tool: 'deny' },
      enforced: true,
    });

    // Team policy exists but has no entry for this tool → user override applies.
    const result = evaluateApprovalPolicy(userId, 'only_user_tool', 'unknown', teamId);
    expect(result.decision).toBe('approve');
    expect(result.policySource).toBe('user');
  });

  it('emits exactly one audit event per evaluation with correct outcome mapping', () => {
    const userId = uniqueId('user-audit');
    const teamId = uniqueId('team-audit');
    const events: Array<{ action: string; outcome: string; resource: string; metadata?: unknown }> =
      [];
    onAuditEvent((e) => events.push(e));

    setTeamPolicy({
      teamId,
      toolOverrides: { dangerous_op: 'deny' },
      enforced: true,
    });

    const before = events.length;
    const result = evaluateApprovalPolicy(userId, 'dangerous_op', 'dangerous', teamId);
    const emitted = events.slice(before);

    expect(result.decision).toBe('deny');
    expect(emitted).toHaveLength(1);
    const event = emitted[0]!;
    // A 'deny' decision maps to the tool_denied action with outcome 'denied'.
    expect(event.action).toBe('tool_denied');
    expect(event.outcome).toBe('denied');
    expect(event.resource).toBe('dangerous_op');
    expect(event.metadata).toMatchObject({
      policyDecision: 'deny',
      policySource: 'team',
      riskLevel: 'dangerous',
      teamId,
    });
  });

  it('maps require_approval to a success (pending) audit outcome, not denied', () => {
    const userId = uniqueId('user-pending');
    const events: Array<{ action: string; outcome: string }> = [];
    onAuditEvent((e) => events.push(e));

    const before = events.length;
    evaluateApprovalPolicy(userId, 'review_me', 'unknown');
    const emitted = events.slice(before);

    expect(emitted).toHaveLength(1);
    // Pending human review is recorded as a successful approval-flow event,
    // not a denial — distinguishes "needs review" from "rejected".
    expect(emitted[0]!.action).toBe('tool_approved');
    expect(emitted[0]!.outcome).toBe('success');
  });

  it('isolates an audit listener that throws so other listeners and the result still succeed', () => {
    const userId = uniqueId('user-throw');
    const good: string[] = [];
    onAuditEvent(() => {
      throw new Error('listener boom');
    });
    onAuditEvent((e) => good.push(e.resource));

    // Must not throw despite the faulty listener.
    const result = evaluateApprovalPolicy(userId, 'resilient_tool', 'safe');
    expect(result.decision).toBe('approve');
    expect(good).toContain('resilient_tool');
  });

  it('covers every RiskLevel value through the default decision path', () => {
    const userId = uniqueId('user-allrisk');
    const expected: Record<RiskLevel, string> = {
      safe: 'approve',
      unknown: 'require_approval',
      dangerous: 'require_approval',
    };
    for (const risk of Object.keys(expected) as RiskLevel[]) {
      const r = evaluateApprovalPolicy(userId, `tool_${risk}`, risk);
      expect(r.decision).toBe(expected[risk]);
    }
  });
});
