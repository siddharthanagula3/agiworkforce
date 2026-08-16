import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getCustomRemoteMcpLimit,
  getKnowledgeStorageLimitBytes,
  getKnowledgeStorageLimitErrorMessage,
  getProjectLimit,
  getProjectLimitErrorMessage,
  getCustomRemoteMcpLimitErrorMessage,
  isUserResourceLimitError,
} from './free-plan-entitlements';

describe('managed cloud resource entitlements', () => {
  it.each([
    ['free', 1, 1],
    ['basic', 5, 5],
    ['pro', 25, 25],
    ['team', 25, 25],
    ['max', null, null],
    ['max_15x', null, null],
    ['enterprise', null, null],
  ] as const)('uses the shared product limits for %s', (plan, projects, connectors) => {
    expect(getProjectLimit(plan)).toBe(projects);
    expect(getCustomRemoteMcpLimit(plan)).toBe(connectors);
  });

  it('does not treat a negotiated Enterprise limit as zero', () => {
    expect(getProjectLimit('enterprise')).not.toBe(0);
    expect(getCustomRemoteMcpLimit('enterprise')).not.toBe(0);
  });

  it.each([null, undefined, '', 'starter', 'max_20x'])(
    'fails closed for missing or unknown plan %j',
    (plan) => {
      expect(getProjectLimit(plan)).toBe(0);
      expect(getCustomRemoteMcpLimit(plan)).toBe(0);
    },
  );

  it('builds plan-specific, user-safe limit messages', () => {
    expect(getProjectLimitErrorMessage('basic')).toBe(
      'Basic accounts can have up to 5 Projects. Delete a Project or upgrade to add another.',
    );
    expect(getCustomRemoteMcpLimitErrorMessage('team')).toBe(
      'Team accounts can add up to 25 custom connectors. Remove one or upgrade to add another.',
    );
    expect(getProjectLimitErrorMessage('unknown')).toBe(
      'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.',
    );
  });

  it('recognizes only the database quota sentinel', () => {
    expect(
      isUserResourceLimitError({ code: 'P0001', message: 'user_resource_limit_reached' }),
    ).toBe(true);
    expect(isUserResourceLimitError({ code: '23505', message: 'unique violation' })).toBe(false);
  });

  describe('knowledge storage quota', () => {
    it.each([
      ['free', 100 * 1024 ** 2],
      ['basic', 1024 ** 3],
      ['pro', 10 * 1024 ** 3],
      ['team', 25 * 1024 ** 3],
    ] as const)('caps %s at a finite byte allowance', (plan, expected) => {
      expect(getKnowledgeStorageLimitBytes(plan)).toBe(expected);
    });

    it.each(['max', 'max_15x', 'enterprise'] as const)(
      'leaves %s uncapped rather than zero',
      (plan) => {
        expect(getKnowledgeStorageLimitBytes(plan)).toBeNull();
      },
    );

    it('fails closed for an unknown plan', () => {
      expect(getKnowledgeStorageLimitBytes('not-a-plan')).toBe(0);
    });

    it('names the plan and its allowance in the limit message', () => {
      expect(getKnowledgeStorageLimitErrorMessage('basic', 1024 ** 3)).toContain('Basic');
      expect(getKnowledgeStorageLimitErrorMessage('basic', 1024 ** 3)).toContain('1 GB');
    });
  });
});
