import { describe, expect, it } from 'vitest';
import {
  CONTEXT_INVALIDATION_TRIGGERS,
  CONTEXT_POLICY_FLAGS,
  CONTEXT_RETENTIONS,
  CONTEXT_SENSITIVITIES,
  CONTEXT_SOURCE_CLASSES,
  CONTEXT_SOURCE_PRECEDENCE,
  CONTEXT_SOURCE_SCOPES,
  contextSourceClassPolicies,
  contextSourceClassPolicy,
} from '../context-source';

describe('every context source declares its own controls', () => {
  it('names an enable/disable control for each class, independent of its neighbours', () => {
    for (const sourceClass of CONTEXT_SOURCE_CLASSES) {
      const { enabledBy } = contextSourceClassPolicy(sourceClass);
      expect(enabledBy.kind, sourceClass).toBeTruthy();
      if (enabledBy.kind === 'always_on' || enabledBy.kind === 'per_request') continue;
      expect(enabledBy.key.trim().length, sourceClass).toBeGreaterThan(0);
    }
  });

  it('gives each class a scope, a sensitivity and a retention from the declared vocabularies', () => {
    for (const policy of contextSourceClassPolicies()) {
      expect(CONTEXT_SOURCE_SCOPES, policy.sourceClass).toContain(policy.scope);
      expect(CONTEXT_SENSITIVITIES, policy.sourceClass).toContain(policy.sensitivity);
      expect(CONTEXT_RETENTIONS, policy.sourceClass).toContain(policy.retention);
    }
  });

  it('says what invalidates each class, from the declared triggers', () => {
    for (const policy of contextSourceClassPolicies()) {
      for (const trigger of policy.invalidatedBy) {
        expect(CONTEXT_INVALIDATION_TRIGGERS, policy.sourceClass).toContain(trigger);
      }
      expect(new Set(policy.invalidatedBy).size).toBe(policy.invalidatedBy.length);
      if (policy.retention !== 'durable') continue;
      expect(policy.invalidatedBy.length, `${policy.sourceClass} outlives a turn`).toBeGreaterThan(
        0,
      );
    }
  });

  it('excludes every durable personal class from a temporary chat', () => {
    for (const policy of contextSourceClassPolicies()) {
      if (policy.retention === 'durable' && policy.canBeRetrieved && policy.canGenerateMemory) {
        expect(policy.excludedFromTemporaryChat, policy.sourceClass).toBe(true);
      }
    }
  });

  it('names the workspace flag for every class a workspace can turn off, and only those', () => {
    for (const policy of contextSourceClassPolicies()) {
      if (policy.policyFlag === null) continue;
      expect(CONTEXT_POLICY_FLAGS, policy.sourceClass).toContain(policy.policyFlag);
    }
    const governed = contextSourceClassPolicies().filter((policy) => policy.policyFlag !== null);
    expect(new Set(governed.map((policy) => policy.policyFlag))).toEqual(
      new Set(CONTEXT_POLICY_FLAGS),
    );
  });

  it('gives each class a sentence a user can be shown', () => {
    const explanations = contextSourceClassPolicies().map((policy) => policy.explanation);
    for (const explanation of explanations) {
      expect(explanation.trim().length).toBeGreaterThan(12);
      expect(explanation.trim().endsWith('.')).toBe(true);
    }
    expect(new Set(explanations).size).toBe(explanations.length);
  });

  it('uses every value in every vocabulary it declares', () => {
    const policies = contextSourceClassPolicies();
    expect(new Set(policies.map((policy) => policy.scope))).toEqual(new Set(CONTEXT_SOURCE_SCOPES));
    expect(new Set(policies.map((policy) => policy.sensitivity))).toEqual(
      new Set(CONTEXT_SENSITIVITIES),
    );
    expect(new Set(policies.map((policy) => policy.retention))).toEqual(
      new Set(CONTEXT_RETENTIONS),
    );
    expect(new Set(policies.flatMap((policy) => [...policy.invalidatedBy]))).toEqual(
      new Set(CONTEXT_INVALIDATION_TRIGGERS),
    );
  });
});

describe('context precedence', () => {
  it('ranks every class exactly once', () => {
    expect([...CONTEXT_SOURCE_PRECEDENCE].sort()).toEqual([...CONTEXT_SOURCE_CLASSES].sort());
    expect(new Set(CONTEXT_SOURCE_PRECEDENCE).size).toBe(CONTEXT_SOURCE_PRECEDENCE.length);
  });

  it('puts every instruction class above every class that is merely data', () => {
    const lastInstruction = CONTEXT_SOURCE_PRECEDENCE.reduce(
      (last, sourceClass, index) =>
        contextSourceClassPolicy(sourceClass).isInstruction ? index : last,
      -1,
    );
    const firstData = CONTEXT_SOURCE_PRECEDENCE.findIndex(
      (sourceClass) => !contextSourceClassPolicy(sourceClass).isInstruction,
    );
    expect(lastInstruction).toBeLessThan(firstData);
  });

  it('puts the safety layer first and external content last', () => {
    expect(CONTEXT_SOURCE_PRECEDENCE[0]).toBe('security_policy');
    const externalRanks = CONTEXT_SOURCE_PRECEDENCE.map((sourceClass, index) => ({
      index,
      isExternal: contextSourceClassPolicy(sourceClass).isExternal,
    }));
    const lowestInternal = Math.max(
      ...externalRanks.filter((rank) => !rank.isExternal).map((rank) => rank.index),
    );
    expect(externalRanks[externalRanks.length - 1]?.isExternal).toBe(true);
    expect(lowestInternal).toBeLessThan(CONTEXT_SOURCE_PRECEDENCE.length - 1);
  });
});
