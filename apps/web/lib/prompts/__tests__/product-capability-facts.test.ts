import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { productArtifactConnectors, productCapabilityFacts } from '../product-capability-facts';

const FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../../tools/evals/datasets/fixtures/product-capabilities.json',
);

const evalFacts = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, readonly string[]>;

function facts(tier: string, surface = 'web', cloudExecutionDeploymentEnabled = true) {
  return productCapabilityFacts({
    userId: 'user-1',
    tier,
    surface,
    cloudExecutionDeploymentEnabled,
  });
}

describe('the product capabilities the chat prompt describes', () => {
  it.each(['free', 'pro'])('matches what the eval corpus renders for %s on web', (tier) => {
    expect(facts(tier)).toEqual(evalFacts[tier]);
  });

  it('gives Free no image generation, Deep Research or AGI Work, and Pro all three', () => {
    for (const capability of ['canUseImages', 'canUseDeepResearch', 'canUseAgiWork'] as const) {
      expect(facts('free')).not.toContain(capability);
      expect(facts('pro')).toContain(capability);
    }
  });

  it('claims connected apps on no plan while connectors are unreleased', () => {
    for (const tier of ['free', 'pro', 'max']) {
      expect(facts(tier)).not.toContain('canUseConnectors');
      expect(productArtifactConnectors(tier, facts(tier))).toBe(false);
    }
  });

  it('claims no code run when the deployment has no sandboxes', () => {
    expect(facts('pro', 'web', false)).not.toContain('canUseCloudExecution');
  });

  it('reads an unknown surface as web rather than granting it more', () => {
    expect(facts('free', 'chrome')).toEqual(facts('free', 'web'));
  });
});
