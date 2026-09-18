import { describe, expect, it } from 'vitest';

import {
  AUTONOMOUS_TOOL_APPROVALS_ORGANIZATION_KEY,
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_POLICIES,
  TOOL_APPROVAL_POLICY_OPTIONS,
  organizationPermitsAutonomousToolApprovals,
  resolveEffectiveToolApprovalPolicy,
  toolApprovalPolicyOption,
} from '../tool-approval-policy';

describe('tool approval policies', () => {
  it('offers exactly the three policies the runtime can act on', () => {
    expect(TOOL_APPROVAL_POLICIES).toEqual([
      'ask_every_time',
      'auto_approve_read_only',
      'autonomous',
    ]);
    expect(TOOL_APPROVAL_POLICY_OPTIONS.map((option) => option.policy)).toEqual([
      ...TOOL_APPROVAL_POLICIES,
    ]);
    for (const policy of TOOL_APPROVAL_POLICIES) {
      expect(toolApprovalPolicyOption(policy).policy).toBe(policy);
    }
  });

  it('keeps asking as the default a never-configured account lands on', () => {
    expect(DEFAULT_TOOL_APPROVAL_POLICY).toBe('ask_every_time');
  });
});

describe('organizationPermitsAutonomousToolApprovals', () => {
  it('permits an unconfigured or silent workspace', () => {
    expect(organizationPermitsAutonomousToolApprovals(null)).toBe(true);
    expect(organizationPermitsAutonomousToolApprovals(undefined)).toBe(true);
    expect(organizationPermitsAutonomousToolApprovals({})).toBe(true);
    expect(
      organizationPermitsAutonomousToolApprovals({
        [AUTONOMOUS_TOOL_APPROVALS_ORGANIZATION_KEY]: true,
      }),
    ).toBe(true);
  });

  it('forbids on false and on any value that is not the boolean true', () => {
    for (const value of [false, 'false', 'true', 0, 1, {}, []]) {
      expect(
        organizationPermitsAutonomousToolApprovals({
          [AUTONOMOUS_TOOL_APPROVALS_ORGANIZATION_KEY]: value,
        }),
      ).toBe(false);
    }
  });
});

describe('resolveEffectiveToolApprovalPolicy', () => {
  it('leaves the approval-gated policies alone whatever the workspace says', () => {
    for (const permitted of [true, false]) {
      expect(
        resolveEffectiveToolApprovalPolicy('ask_every_time', {
          organizationPermitsAutonomous: permitted,
        }),
      ).toBe('ask_every_time');
      expect(
        resolveEffectiveToolApprovalPolicy('auto_approve_read_only', {
          organizationPermitsAutonomous: permitted,
        }),
      ).toBe('auto_approve_read_only');
    }
  });

  it('honours autonomous only where the workspace permits it', () => {
    expect(
      resolveEffectiveToolApprovalPolicy('autonomous', { organizationPermitsAutonomous: true }),
    ).toBe('autonomous');
  });

  it('drops a forbidden autonomous choice to the default, never to read-only', () => {
    expect(
      resolveEffectiveToolApprovalPolicy('autonomous', { organizationPermitsAutonomous: false }),
    ).toBe(DEFAULT_TOOL_APPROVAL_POLICY);
  });
});
