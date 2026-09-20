import { describe, expect, it } from 'vitest';
import { BILLING_PLAN_CAPABILITY_TIERS, canUseBillingPlanCapability } from '../billing-catalog';
import { COMPAT_CAPABILITY_SOURCES } from '../model-catalog';
import { TRUST_MODE_CONTRACTS } from '../trust-mode-contract';
import {
  INTERACTION_MODES,
  INTERACTION_MODE_DEFINITIONS,
  interactionMode,
  interactionModeBlock,
  interactionModeTransition,
  isInteractionMode,
  type InteractionModeId,
} from '../interaction-modes';

/**
 * Checklist 1.9 names what a mode has to answer for. Each key below is one of
 * those answers; a mode that leaves one out is not defined.
 */
const REQUIRED_KEYS = [
  'label',
  'description',
  'models',
  'requiredModelCapabilities',
  'requiredTools',
  'optionalTools',
  'sourceBehavior',
  'fileBehavior',
  'memoryBehavior',
  'projectBehavior',
  'approvalBehavior',
  'streamingFormat',
  'persistence',
  'backgroundExecution',
  'usageAccounting',
  'billing',
  'cancellation',
  'resume',
  'crossDevice',
  'offline',
  'trustModes',
  'enterprisePolicy',
  'outputTypes',
] as const;

const ordered: readonly (readonly [InteractionModeId, InteractionModeId])[] =
  INTERACTION_MODES.flatMap((from) => INTERACTION_MODES.map((to) => [from, to] as const)).filter(
    ([from, to]) => from !== to,
  );

describe('interaction mode vocabulary', () => {
  it('has at least one mode and no duplicates', () => {
    expect(INTERACTION_MODES.length).toBeGreaterThan(0);
    expect(new Set(INTERACTION_MODES).size).toBe(INTERACTION_MODES.length);
  });

  it.each(INTERACTION_MODES)('%s defines every attribute a mode owes', (id) => {
    const definition = interactionMode(id) as unknown as Record<string, unknown>;
    for (const key of REQUIRED_KEYS) {
      expect(definition[key], `${id}.${key}`).toBeDefined();
    }
    expect(interactionMode(id).label.length).toBeGreaterThan(0);
    expect(interactionMode(id).description.length).toBeGreaterThan(0);
  });

  it.each(INTERACTION_MODES)('%s gates on a capability the plan catalog knows', (id) => {
    const { gates, billing } = interactionMode(id);
    expect(BILLING_PLAN_CAPABILITY_TIERS).toHaveProperty(gates.entitlement);
    expect(BILLING_PLAN_CAPABILITY_TIERS).toHaveProperty(billing);
  });

  it.each(INTERACTION_MODES)('%s requires only capabilities a model can report', (id) => {
    for (const capability of interactionMode(id).requiredModelCapabilities) {
      expect(COMPAT_CAPABILITY_SOURCES).toHaveProperty(capability);
    }
  });

  it.each(INTERACTION_MODES)('%s runs only in trust boundaries that exist', (id) => {
    const { trustModes } = interactionMode(id);
    expect(trustModes.length).toBeGreaterThan(0);
    for (const trustMode of trustModes) {
      expect(TRUST_MODE_CONTRACTS).toHaveProperty(trustMode);
    }
  });

  it('recognises its own ids and nothing else', () => {
    for (const id of INTERACTION_MODES) expect(isInteractionMode(id)).toBe(true);
    expect(isInteractionMode('telepathy')).toBe(false);
    expect(isInteractionMode(undefined)).toBe(false);
  });
});

describe('interaction mode transitions', () => {
  it('declares a rule for every ordered pair of different modes', () => {
    expect(ordered.length).toBe(INTERACTION_MODES.length * (INTERACTION_MODES.length - 1));
    for (const [from, to] of ordered) {
      const rule = interactionModeTransition(from, to);
      expect(rule.from).toBe(from);
      expect(rule.to).toBe(to);
    }
  });

  it.each(ordered)('%s to %s re-evaluates the destination, not the source', (from, to) => {
    const rule = interactionModeTransition(from, to);
    const target = interactionMode(to);
    expect(rule.requiredTools).toEqual(target.requiredTools);
    expect(rule.optionalTools).toEqual(target.optionalTools);
    expect(rule.approval).toBe(target.approvalBehavior);
    expect(rule.entitlement).toBe(target.gates.entitlement);
    expect(rule.trustModes).toEqual(target.trustModes);
    expect(rule.usageAccounting).toBe(target.usageAccounting);
  });

  it.each(ordered)('%s to %s warns exactly when something is lost', (from, to) => {
    const rule = interactionModeTransition(from, to);
    expect(rule.warns).toBe(rule.loses.length > 0);
  });

  it.each(ordered)('%s to %s never carries context into a new session', (from, to) => {
    const rule = interactionModeTransition(from, to);
    if (rule.conversation === 'new') {
      expect(rule.contextCarryOver).toBe('withheld');
      expect(rule.runningTurn).toBe('must-end');
      expect(rule.loses).toContain('conversation');
    } else {
      expect(rule.contextCarryOver).toBe('carried');
    }
  });

  it.each(ordered)('%s to %s is reversible only when the draft survives in place', (from, to) => {
    const rule = interactionModeTransition(from, to);
    expect(rule.reversible).toBe(rule.conversation === 'same' && rule.draft === 'preserved');
  });

  it('keeps the draft and the conversation across the two composer work modes', () => {
    const rule = interactionModeTransition('chat', 'agiwork');
    expect(rule.draft).toBe('preserved');
    expect(rule.conversation).toBe('same');
    expect(rule.runningTurn).toBe('continues');
    expect(rule.warns).toBe(false);
  });

  it('drops the project when a mode that has no project scope is entered', () => {
    expect(interactionModeTransition('agiwork', 'image').project).toBe('cleared');
    expect(interactionModeTransition('agiwork', 'image').warns).toBe(true);
  });

  it('re-selects the model when the destination draws from another catalog', () => {
    expect(interactionModeTransition('chat', 'video').model).toBe('re-selected');
    expect(interactionModeTransition('chat', 'search').model).toBe('kept');
  });

  it('keeps attachments only where both modes treat files the same way', () => {
    expect(interactionModeTransition('chat', 'search').attachments).toBe('preserved');
    expect(interactionModeTransition('chat', 'image').attachments).toBe('cleared');
    expect(interactionModeTransition('chat', 'voice').attachments).toBe('cleared');
  });

  it('keeps the memory scope only where both modes read and write it', () => {
    expect(interactionModeTransition('chat', 'research').memory).toBe('preserved');
    expect(interactionModeTransition('chat', 'image').memory).toBe('cleared');
  });

  it('resets the sources when the destination reads from somewhere else', () => {
    expect(interactionModeTransition('chat', 'search').sources).toBe('reset');
    expect(interactionModeTransition('chat', 'code').sources).toBe('preserved');
  });

  it('flags a destination that admits fewer trust boundaries than the source', () => {
    expect(interactionModeTransition('chat', 'research').trustNarrowed).toBe(true);
    expect(interactionModeTransition('research', 'chat').trustNarrowed).toBe(false);
  });

  it('records the mode on both ends, so the previous one is reconstructable', () => {
    for (const [from, to] of ordered) {
      const rule = interactionModeTransition(from, to);
      expect(interactionModeTransition(rule.to, rule.from).to).toBe(from);
    }
  });
});

describe('interaction mode entry', () => {
  it('refuses a mode that does not exist', () => {
    expect(interactionModeBlock('telepathy', { entitled: () => true })).toBe('unknown_mode');
  });

  it('refuses a mode the plan does not carry, by the plan catalog answer', () => {
    const video = interactionMode('video');
    expect(
      interactionModeBlock('video', {
        entitled: (capability) => canUseBillingPlanCapability('free', capability),
      }),
    ).toBe('not_entitled');
    expect(canUseBillingPlanCapability('free', video.gates.entitlement)).toBe(false);
  });

  it('refuses a mode that cannot run in the caller trust boundary', () => {
    expect(interactionModeBlock('video', { entitled: () => true, trustMode: 'local' })).toBe(
      'trust_boundary',
    );
  });

  it('admits a mode that clears both gates', () => {
    expect(interactionModeBlock('chat', { entitled: () => true, trustMode: 'local' })).toBeNull();
  });

  it('exposes every definition through the frozen registry', () => {
    expect(Object.isFrozen(INTERACTION_MODE_DEFINITIONS)).toBe(true);
  });
});
