import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  parseToolApprovalPolicy,
} from './toolApprovalPolicy';

describe('parseToolApprovalPolicy', () => {
  it('uses Skip approvals for an unconfigured website account', () => {
    expect(parseToolApprovalPolicy({})).toBe('autonomous');
    expect(parseToolApprovalPolicy(null)).toBe('autonomous');
    expect(WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY).toBe('autonomous');
  });

  it('keeps the shared error fallback asking', () => {
    expect(DEFAULT_TOOL_APPROVAL_POLICY).toBe('ask_every_time');
    expect(parseToolApprovalPolicy('unreadable')).toBe('ask_every_time');
  });

  it('reads the namespace the settings panel writes', () => {
    expect(
      parseToolApprovalPolicy({
        [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: { defaultPolicy: 'auto_approve_read_only' },
      }),
    ).toBe('auto_approve_read_only');
  });

  it('reads the autonomous choice the panel can now write', () => {
    expect(
      parseToolApprovalPolicy({
        [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: { defaultPolicy: 'autonomous' },
      }),
    ).toBe('autonomous');
  });

  it('refuses an unrecognized stored policy instead of widening access', () => {
    expect(
      parseToolApprovalPolicy({
        [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: { defaultPolicy: 'allow_everything' },
      }),
    ).toBe('ask_every_time');
    expect(parseToolApprovalPolicy({ [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: 'auto' })).toBe(
      'ask_every_time',
    );
  });
});
