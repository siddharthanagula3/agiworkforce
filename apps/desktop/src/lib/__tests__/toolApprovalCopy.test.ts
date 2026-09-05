import { TOOL_APPROVAL_REASONS, type ToolApprovalRequest } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  describeApprovalReason,
  describeApprovalRisk,
  isApprovalAnswerable,
} from '../toolApprovalCopy';

function request(overrides: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest {
  return {
    requestId: 'req-1',
    callId: 'call-1',
    tool: 'computer_use_click',
    actionClass: 'execute',
    arguments: {},
    reason: 'risk_tier',
    riskLevel: 'high',
    reversible: false,
    unattended: true,
    rememberable: false,
    ...overrides,
  };
}

describe('tool approval copy', () => {
  it('has a sentence for every reason the contract can produce', () => {
    for (const reason of TOOL_APPROVAL_REASONS) {
      const sentence = describeApprovalReason(request({ reason }));
      expect(sentence, reason).toBeTruthy();
      expect(sentence, reason).not.toContain('_');
    }
  });

  it('names each risk band', () => {
    expect(describeApprovalRisk(request({ riskLevel: 'low' }))).toBe('Low risk');
    expect(describeApprovalRisk(request({ riskLevel: 'medium' }))).toBe('Medium risk');
    expect(describeApprovalRisk(request({ riskLevel: 'high' }))).toBe('High risk');
  });

  it('treats only a pending user approval as answerable', () => {
    expect(isApprovalAnswerable(request({ reason: 'user_requires_approval' }))).toBe(true);
    expect(isApprovalAnswerable(request({ reason: 'policy_hard_block' }))).toBe(false);
    expect(isApprovalAnswerable(request({ reason: 'harness_limit' }))).toBe(false);
    expect(isApprovalAnswerable(request({ reason: 'lethal_trifecta' }))).toBe(false);
  });
});
