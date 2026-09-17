import { describe, expect, it } from 'vitest';

import { normalizeUsageAttribution, resolveChatWorkload } from './usage-attribution';

describe('resolveChatWorkload', () => {
  it('names the product area a managed chat turn was spent in', () => {
    expect(resolveChatWorkload({ workMode: 'agiwork', quotaFeature: 'chat' })).toBe('work');
    expect(resolveChatWorkload({ workMode: 'research', quotaFeature: 'chat' })).toBe('research');
    expect(resolveChatWorkload({ workMode: 'chat', quotaFeature: 'computer_use' })).toBe('browser');
    expect(resolveChatWorkload({ workMode: undefined, quotaFeature: 'image' })).toBe('chat');
  });
});

describe('normalizeUsageAttribution', () => {
  it('keeps known workloads and identifier-shaped ids', () => {
    expect(
      normalizeUsageAttribution({
        workload: 'code',
        projectId: '22222222-2222-4222-8222-222222222222',
        sessionId: 'session_abc',
      }),
    ).toEqual({
      workload: 'code',
      projectId: '22222222-2222-4222-8222-222222222222',
      sessionId: 'session_abc',
    });
  });

  it('nulls anything it cannot trust instead of writing it to the ledger', () => {
    expect(
      normalizeUsageAttribution({
        workload: 'mining',
        projectId: 'a b',
        sessionId: 'x'.repeat(201),
      }),
    ).toEqual({ workload: null, projectId: null, sessionId: null });
    expect(normalizeUsageAttribution(undefined)).toEqual({
      workload: null,
      projectId: null,
      sessionId: null,
    });
  });
});
