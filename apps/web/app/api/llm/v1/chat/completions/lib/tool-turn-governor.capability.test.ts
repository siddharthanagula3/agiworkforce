import { describe, expect, it } from 'vitest';

import {
  emptyToolCapabilityEvidence,
  resolveToolCapabilityObservation,
  withdrawalIsModelEvidence,
  type ToolCapabilityEvidence,
  type ToolWithdrawalReason,
} from './tool-turn-governor';

const HARNESS_REASONS: readonly ToolWithdrawalReason[] = [
  'unavailable',
  'budget',
  'repeated-query',
  'turn-cap',
];

function evidence(overrides: Partial<ToolCapabilityEvidence>): ToolCapabilityEvidence {
  return { ...emptyToolCapabilityEvidence(), ...overrides };
}

describe('withdrawal attribution', () => {
  it.each(HARNESS_REASONS)('does not blame the model for %s', (reason) => {
    expect(withdrawalIsModelEvidence(reason)).toBe(false);
  });
});

describe('tool capability observation', () => {
  it('says nothing when no tool was offered', () => {
    expect(resolveToolCapabilityObservation(evidence({ toolsOffered: false }))).toBeUndefined();
  });

  it('says nothing when a tool was offered, none required, and none called', () => {
    expect(resolveToolCapabilityObservation(evidence({ toolsOffered: true }))).toBeUndefined();
  });

  it('honours a turn that made a well formed call', () => {
    expect(
      resolveToolCapabilityObservation(evidence({ toolsOffered: true, wellFormedCalls: 1 })),
    ).toBe(true);
  });

  it('counts a malformed call as a miss', () => {
    expect(
      resolveToolCapabilityObservation(
        evidence({ toolsOffered: true, wellFormedCalls: 1, malformedCalls: 1 }),
      ),
    ).toBe(false);
  });

  it('counts a required tool the model never called as a miss', () => {
    expect(
      resolveToolCapabilityObservation(evidence({ toolsOffered: true, requiredToolsMissed: 1 })),
    ).toBe(false);
  });
});
