import { describe, expect, it } from 'vitest';
import { modelsById } from '@agiworkforce/types';
import { getAgiTaskModelEligibility } from '../modelCapabilityGates';

describe('getAgiTaskModelEligibility', () => {
  it('admits only an exact catalog model with tools and agentic capability', () => {
    const eligible = Object.values(modelsById).find(
      (model) => model.capabilities.agentic === true && model.capabilities.tools === true,
    );
    expect(eligible).toBeDefined();

    expect(
      getAgiTaskModelEligibility({
        id: eligible!.id,
        name: eligible!.name,
        supportsTools: true,
      }),
    ).toEqual({ eligible: true });
  });

  it('does not turn runtime function-call support into an agentic claim', () => {
    const result = getAgiTaskModelEligibility({
      id: 'fixture-local-model:tools',
      name: 'Fixture local model',
      supportsTools: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('supports function tools');
    expect(result.reason).toContain('not verified for Tasks');
  });
});
