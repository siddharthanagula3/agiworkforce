import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getCustomRemoteMcpLimit,
  getCustomRemoteMcpLimitErrorMessage,
  getProjectLimit,
  getProjectLimitErrorMessage,
  isContractNegotiatedLimit,
} from './free-plan-entitlements';

describe('policy source behind an uncapped limit', () => {
  it('separates a contract-negotiated limit from a plan default that has none', () => {
    expect(getProjectLimit('enterprise')).toBeNull();
    expect(getProjectLimit('max')).toBeNull();

    expect(isContractNegotiatedLimit('enterprise', 'projects')).toBe(true);
    expect(isContractNegotiatedLimit('enterprise', 'customMcpServers')).toBe(true);
    expect(isContractNegotiatedLimit('enterprise', 'knowledgeStorageBytes')).toBe(true);
    expect(isContractNegotiatedLimit('max', 'projects')).toBe(false);
    expect(isContractNegotiatedLimit('pro', 'projects')).toBe(false);
    expect(isContractNegotiatedLimit('not-a-plan', 'projects')).toBe(false);
  });

  it('tells an Enterprise user the Project limit came from their contract', () => {
    const message = getProjectLimitErrorMessage('enterprise');
    expect(message).toContain('contract');
    expect(message).not.toContain('no Project limit from your plan');
    expect(message).not.toBe(getProjectLimitErrorMessage('max'));
  });

  it('tells an Enterprise user the connector limit came from their contract', () => {
    const message = getCustomRemoteMcpLimitErrorMessage('enterprise');
    expect(getCustomRemoteMcpLimit('enterprise')).toBeNull();
    expect(message).toContain('contract');
    expect(message).not.toContain('no custom connector limit from your plan');
    expect(message).not.toBe(getCustomRemoteMcpLimitErrorMessage('max'));
  });

  it('leaves the plan-default wording for tiers whose plan really is uncapped', () => {
    expect(getProjectLimitErrorMessage('max')).toContain('no Project limit from your plan');
    expect(getCustomRemoteMcpLimitErrorMessage('max_15x')).toContain(
      'no custom connector limit from your plan',
    );
  });
});
