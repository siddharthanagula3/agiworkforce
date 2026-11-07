import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { connectorsReleased, hasReleasedConnectors } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import { productArtifactConnectors, productCapabilityFacts } from '../product-capability-facts';
import { assembleChatSystemPrompt } from '../chat-system-prompt-assembly';
import { chatSystemPromptSection, chatSystemPromptSections } from '../chat-system-prompt';
import { buildMeCapabilityHandshake } from '@/lib/services/capability-handshake-service';

const FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../../tools/evals/datasets/fixtures/product-capabilities.json',
);

const evalFacts = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, readonly string[]>;

const NO_EXCLUSIONS = {
  closedCapabilities: [],
  userDisabledCapabilities: [],
  workspaceDisabledCapabilities: [],
};

function facts(
  tier: string,
  surface = 'web',
  cloudExecutionDeploymentEnabled = true,
  allowSelectiveConnectors = true,
) {
  return productCapabilityFacts({
    userId: 'user-1',
    tier,
    surface,
    cloudExecutionDeploymentEnabled,
    allowSelectiveConnectors,
    exclusions: NO_EXCLUSIONS,
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

  it('describes selective ordinary-chat connectors only on an eligible plan', () => {
    expect(connectorsReleased()).toBe(false);
    expect(hasReleasedConnectors()).toBe(true);
    expect(facts('free')).not.toContain('canUseConnectors');
    for (const tier of ['pro', 'max']) {
      expect(facts(tier)).toContain('canUseConnectors');
    }
  });

  it('keeps artifact connector guidance on the full-release gate', () => {
    for (const tier of ['free', 'pro', 'max']) {
      expect(productArtifactConnectors(tier, facts(tier))).toBe(false);
    }
  });

  it('withholds selective connectors by default and for an explicitly closed context', () => {
    const input = {
      userId: 'user-1',
      tier: 'pro',
      surface: 'web' as const,
      cloudExecutionDeploymentEnabled: true,
      exclusions: NO_EXCLUSIONS,
    };
    expect(buildMeCapabilityHandshake(input).granted).toContain('canUseConnectors');
    const generic = productCapabilityFacts(input);
    expect(generic).not.toContain('canUseConnectors');
    expect(facts('pro', 'web', true, false)).toEqual(generic);
    expect(generic).toEqual(facts('pro').filter((capability) => capability !== 'canUseConnectors'));
  });

  it.each([
    'closedCapabilities',
    'userDisabledCapabilities',
    'workspaceDisabledCapabilities',
  ] as const)('preserves %s for selective connector facts', (exclusion) => {
    const narrowed = productCapabilityFacts({
      userId: 'user-1',
      tier: 'pro',
      surface: 'web',
      cloudExecutionDeploymentEnabled: true,
      allowSelectiveConnectors: true,
      exclusions: { ...NO_EXCLUSIONS, [exclusion]: ['canUseConnectors'] },
    });
    expect(narrowed).not.toContain('canUseConnectors');
    expect(narrowed).toEqual(
      facts('pro').filter((capability) => capability !== 'canUseConnectors'),
    );
  });

  it('renders ordinary-chat availability without artifact connector instructions', () => {
    const sections = chatSystemPromptSections(7);
    const connectorLine = chatSystemPromptSection(sections, 'product_capability.canUseConnectors');
    const artifactGuidance = chatSystemPromptSection(sections, 'artifact_runtime_connectors');
    expect(connectorLine.length).toBeGreaterThan(0);
    expect(artifactGuidance.length).toBeGreaterThan(0);
    const render = (allowSelectiveConnectors: boolean) => {
      const capabilities = facts('pro', 'web', true, allowSelectiveConnectors);
      return assembleChatSystemPrompt(
        sections,
        {
          toolNames: [],
          productCapabilities: capabilities,
          artifactConnectors: productArtifactConnectors('pro', capabilities),
        },
        { utc: '2026-11-01T12:00:00.000Z' },
      ).body;
    };
    expect(render(true)).toContain(`- ${connectorLine}`);
    expect(render(true)).not.toContain(artifactGuidance);
    expect(render(false)).not.toContain(`- ${connectorLine}`);
    expect(render(false)).not.toContain(artifactGuidance);
  });

  it('claims no code run when the deployment has no sandboxes', () => {
    expect(facts('pro', 'web', false)).not.toContain('canUseCloudExecution');
  });

  it('reads an unknown surface as web rather than granting it more', () => {
    expect(facts('free', 'chrome')).toEqual(facts('free', 'web'));
  });

  it('leaves out what an operator, the account or its workspace switched off', () => {
    const open = facts('pro');
    for (const capability of ['canUseWebSearch', 'canUseCloudExecution', 'canUseDeepResearch']) {
      expect(open).toContain(capability);
    }

    const narrowed = productCapabilityFacts({
      userId: 'user-1',
      tier: 'pro',
      surface: 'web',
      cloudExecutionDeploymentEnabled: true,
      allowSelectiveConnectors: true,
      exclusions: {
        closedCapabilities: ['canUseWebSearch'],
        userDisabledCapabilities: ['canUseCloudExecution'],
        workspaceDisabledCapabilities: ['canUseDeepResearch'],
      },
    });

    expect(narrowed).not.toContain('canUseWebSearch');
    expect(narrowed).not.toContain('canUseCloudExecution');
    expect(narrowed).not.toContain('canUseDeepResearch');
    expect(narrowed).toEqual(
      open.filter(
        (capability) =>
          !['canUseWebSearch', 'canUseCloudExecution', 'canUseDeepResearch'].includes(capability),
      ),
    );
  });
});
