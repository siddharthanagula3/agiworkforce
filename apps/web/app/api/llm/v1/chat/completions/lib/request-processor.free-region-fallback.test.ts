import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultModelFor, getRoutingSlotModel } from '@agiworkforce/types';

type ScanModule0 = typeof import('@/lib/logger');
type ComplianceModule = typeof import('@agiworkforce/compliance');

const policy = vi.hoisted(() => ({ usOnly: false }));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('@agiworkforce/compliance', async (importOriginal) => {
  const actual = await importOriginal<ComplianceModule>();
  return {
    ...actual,
    allowedDeveloperJurisdictions: (region: string | null | undefined) =>
      policy.usOnly ? new Set(['US']) : actual.allowedDeveloperJurisdictions(region),
  };
});

import { freeModelRefusedInRegion, resolveWebCloudModelRoute } from './request-processor';

const FREE_TIER = 'free';
const TASK_TYPES = [
  'simple_chat',
  'general',
  'coding',
  'reasoning',
  'research',
  'agentic',
] as const;
const FREE_MODEL = getDefaultModelFor(FREE_TIER, 'chat');
const US_FALLBACK_MODEL = getRoutingSlotModel('workhorse_general');

describe('Free while the region checks no developer country', () => {
  beforeEach(() => {
    policy.usOnly = false;
  });

  it('keeps Free on its free model, exactly as before', () => {
    expect(freeModelRefusedInRegion({ model: 'auto' }, FREE_TIER)).toBe(false);
    for (const taskType of TASK_TYPES) {
      const decision = resolveWebCloudModelRoute('auto', FREE_TIER, taskType);
      expect(decision, taskType).toMatchObject({ status: 'selected', modelKey: FREE_MODEL });
      if (decision.status === 'selected') expect(decision.reason).not.toBe('jurisdiction_fallback');
    }
  });
});

describe('Free once the region allows only US-developed models', () => {
  beforeEach(() => {
    policy.usOnly = true;
  });

  it('keeps a Free Auto turn on Auto instead of naming the refused free model', () => {
    expect(freeModelRefusedInRegion({ model: 'auto' }, FREE_TIER)).toBe(true);
    expect(freeModelRefusedInRegion({ model: 'auto' }, 'basic')).toBe(false);
  });

  it.each(TASK_TYPES)('serves Free %s from the US-developed fallback slot', (taskType) => {
    const decision = resolveWebCloudModelRoute('auto', FREE_TIER, taskType);
    expect(decision).toMatchObject({
      status: 'selected',
      modelKey: US_FALLBACK_MODEL,
      reason: 'jurisdiction_fallback',
    });
  });

  it('does not let Free name the fallback model outside that case', () => {
    const decision = resolveWebCloudModelRoute(US_FALLBACK_MODEL, FREE_TIER, 'general');
    expect(decision).toMatchObject({ status: 'unavailable', code: 'explicit_model_ineligible' });
  });

  it('refuses the free model by name as not available in the region', () => {
    const decision = resolveWebCloudModelRoute(FREE_MODEL, FREE_TIER, 'general');
    expect(decision).toMatchObject({
      status: 'unavailable',
      code: 'model_not_available_in_region',
    });
  });
});
