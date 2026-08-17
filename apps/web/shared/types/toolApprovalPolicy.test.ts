import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  parseToolApprovalPolicy,
} from './toolApprovalPolicy';

describe('parseToolApprovalPolicy', () => {
  it('falls back to asking when the account has no stored default', () => {
    expect(parseToolApprovalPolicy({})).toBe('ask_every_time');
    expect(parseToolApprovalPolicy(null)).toBe('ask_every_time');
    expect(DEFAULT_TOOL_APPROVAL_POLICY).toBe('ask_every_time');
  });

  it('reads the namespace the settings panel writes', () => {
    expect(
      parseToolApprovalPolicy({
        [TOOL_APPROVAL_PREFERENCE_NAMESPACE]: { defaultPolicy: 'auto_approve_read_only' },
      }),
    ).toBe('auto_approve_read_only');
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
