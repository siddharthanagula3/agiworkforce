import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  FREE_CUSTOM_REMOTE_MCP_LIMIT,
  FREE_PROJECT_LIMIT,
  PAID_CUSTOM_REMOTE_MCP_LIMIT,
  getCustomRemoteMcpLimit,
  getProjectLimit,
  isUserResourceLimitError,
} from './free-plan-entitlements';

describe('free plan entitlements', () => {
  it('grants five projects and exactly one custom remote MCP on free', () => {
    expect(FREE_PROJECT_LIMIT).toBe(5);
    expect(FREE_CUSTOM_REMOTE_MCP_LIMIT).toBe(1);
    expect(getProjectLimit('free')).toBe(5);
    expect(getProjectLimit(null)).toBe(5);
    expect(getCustomRemoteMcpLimit('free')).toBe(1);
  });

  it('keeps projects unlimited and the existing connector safety cap for paid tiers', () => {
    expect(PAID_CUSTOM_REMOTE_MCP_LIMIT).toBe(10);
    expect(getProjectLimit('pro')).toBeNull();
    expect(getProjectLimit('max')).toBeNull();
    expect(getCustomRemoteMcpLimit('pro')).toBe(10);
  });

  it('recognizes only the database quota sentinel', () => {
    expect(
      isUserResourceLimitError({ code: 'P0001', message: 'user_resource_limit_reached' }),
    ).toBe(true);
    expect(isUserResourceLimitError({ code: '23505', message: 'unique violation' })).toBe(false);
  });
});
