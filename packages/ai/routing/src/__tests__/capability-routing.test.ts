import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getModelMetadataById } from '@agiworkforce/types';

import { resolveAutoRoute, type IntrinsicCapability, type RoutingTrustMode } from '../auto';
import { getAutoCapabilityEnvelope } from '../auto-capability-envelope';
import type { RoutingTaskType } from '../types';

/**
 * A vision request served by a text-only model is not a bad answer, it is a
 * silent one: the user gets a reply about nothing they attached. Nothing named
 * image or audio routing before, so these are the cases that fail if the
 * capability gate is ever loosened.
 */

const REGISTRY_FILE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'model-registry',
  'generated',
  'registry.json',
);

const registry = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')) as {
  capabilities: Record<string, Record<string, boolean | null>>;
  routes: Record<string, { modelKey: string; providerModelId: string; availability: string }>;
};

const WEB = {
  trustMode: 'managed_cloud' as RoutingTrustMode,
  runtimeProfileId: 'web/cloud-chat',
  currentModelKey: null,
  enableTaskFamilyStage: false,
};

const TIERS = ['free', 'pro', 'max', 'enterprise'] as const;

function supports(modelKey: string, capability: string): boolean {
  return registry.capabilities[modelKey]?.[capability] === true;
}

function modelsWithout(capability: string): string[] {
  return Object.keys(registry.capabilities).filter((modelKey) => !supports(modelKey, capability));
}

function autoRouteFor(options: {
  taskType: RoutingTaskType;
  subscriptionTier: string;
  selection?: string;
  requiredCapabilities?: readonly IntrinsicCapability[];
  fallbackToAutoForCapabilityMismatch?: boolean;
}) {
  return resolveAutoRoute({
    selection: options.selection ?? 'auto',
    taskType: options.taskType,
    subscriptionTier: options.subscriptionTier,
    ...WEB,
    ...(options.requiredCapabilities === undefined
      ? {}
      : { requiredCapabilities: options.requiredCapabilities }),
    ...(options.fallbackToAutoForCapabilityMismatch === undefined
      ? {}
      : { fallbackToAutoForCapabilityMismatch: options.fallbackToAutoForCapabilityMismatch }),
  });
}

describe('image-input routing', () => {
  it('never lands a multimodal request on a model that cannot take an image', () => {
    let selections = 0;
    for (const tier of TIERS) {
      const decision = autoRouteFor({ taskType: 'multimodal', subscriptionTier: tier });
      if (decision.status !== 'selected') continue;
      selections += 1;
      expect(supports(decision.modelKey, 'imageInput'), `${tier} -> ${decision.modelKey}`).toBe(
        true,
      );
    }
    expect(selections).toBe(TIERS.length);
  });

  it('holds the same line when the request itself demands image input', () => {
    for (const taskType of ['general', 'simple_chat', 'coding'] as const) {
      for (const tier of TIERS) {
        const decision = autoRouteFor({
          taskType,
          subscriptionTier: tier,
          requiredCapabilities: ['imageInput'],
        });
        if (decision.status !== 'selected') continue;
        expect(
          supports(decision.modelKey, 'imageInput'),
          `${taskType}/${tier} -> ${decision.modelKey}`,
        ).toBe(true);
      }
    }
  });

  it('refuses a pinned text-only model rather than serving the image request with it', () => {
    const textOnly = modelsWithout('imageInput')[0];
    expect(textOnly, 'the catalog holds no text-only model to pin').toBeDefined();

    const decision = autoRouteFor({
      taskType: 'general',
      subscriptionTier: 'max',
      selection: textOnly!,
      requiredCapabilities: ['imageInput'],
    });

    expect(decision.status).not.toBe('selected');
    if (decision.status === 'unavailable') {
      expect(decision.reasons.join(' ')).toContain('lacks intrinsic capability imageInput');
    }
  });

  it('reroutes a pinned text-only model to a capable one when the caller allows it', () => {
    const textOnly = modelsWithout('imageInput')[0];
    const decision = autoRouteFor({
      taskType: 'general',
      subscriptionTier: 'max',
      selection: textOnly!,
      requiredCapabilities: ['imageInput'],
      fallbackToAutoForCapabilityMismatch: true,
    });

    if (decision.status !== 'selected') return;
    expect(decision.reason).toBe('capability_fallback');
    expect(decision.modelKey).not.toBe(textOnly);
    expect(supports(decision.modelKey, 'imageInput')).toBe(true);
  });
});

describe('audio-input routing', () => {
  it('never lands an audio request on a model that cannot hear one', () => {
    let selections = 0;
    for (const taskType of ['general', 'multimodal'] as const) {
      for (const tier of TIERS) {
        const decision = autoRouteFor({
          taskType,
          subscriptionTier: tier,
          requiredCapabilities: ['audioInput'],
        });
        if (decision.status !== 'selected') continue;
        selections += 1;
        expect(
          supports(decision.modelKey, 'audioInput'),
          `${taskType}/${tier} -> ${decision.modelKey}`,
        ).toBe(true);
      }
    }
    expect(selections).toBe(TIERS.length * 2);
  });

  it('refuses a pinned model with no audio input, naming the capability', () => {
    const textOnly = modelsWithout('audioInput')[0];
    expect(textOnly).toBeDefined();

    const decision = autoRouteFor({
      taskType: 'general',
      subscriptionTier: 'max',
      selection: textOnly!,
      requiredCapabilities: ['audioInput'],
    });

    expect(decision.status).not.toBe('selected');
    if (decision.status === 'unavailable') {
      expect(decision.reasons.join(' ')).toContain('lacks intrinsic capability audioInput');
    }
  });

  it('never promises audio output through a chat route, on any tier', () => {
    for (const tier of TIERS) {
      const decision = autoRouteFor({
        taskType: 'general',
        subscriptionTier: tier,
        requiredCapabilities: ['audioOutput'],
      });
      // No chat-dispatchable route speaks audio back. Selecting one here would
      // mean the picker had started promising a modality the pipeline drops.
      expect(decision.status, `tier ${tier}`).toBe('unavailable');
    }
  });
});

describe('modality validation across every Auto branch', () => {
  const MODALITIES: readonly IntrinsicCapability[] = ['imageInput', 'audioInput', 'videoInput'];

  it('honours every modality it is asked for, on every task type and tier', () => {
    const taskTypes: readonly RoutingTaskType[] = [
      'simple_chat',
      'general',
      'coding',
      'reasoning',
      'creative_writing',
      'multimodal',
      'long_context',
      'research',
      'agentic',
    ];

    let selections = 0;
    for (const capability of MODALITIES) {
      for (const taskType of taskTypes) {
        for (const tier of TIERS) {
          const decision = autoRouteFor({
            taskType,
            subscriptionTier: tier,
            requiredCapabilities: [capability],
          });
          if (decision.status !== 'selected') continue;
          selections += 1;
          expect(
            supports(decision.modelKey, capability),
            `${capability} on ${taskType}/${tier} -> ${decision.modelKey}`,
          ).toBe(true);
        }
      }
    }
    // A loop that selected nothing would assert nothing.
    expect(selections).toBeGreaterThan(MODALITIES.length);
  });

  it('advertises vision in the picker only when every reachable route has it', () => {
    for (const tier of TIERS) {
      const envelope = getAutoCapabilityEnvelope({
        selection: 'auto',
        subscriptionTier: tier,
        trustMode: 'managed_cloud',
        runtimeProfileId: 'web/cloud-chat',
      });
      if (envelope === null) continue;
      const everyRouteSeesImages = envelope.reachableModelKeys.every((modelKey) =>
        supports(modelKey, 'imageInput'),
      );
      expect(envelope.supportsVision, `tier ${tier}`).toBe(everyRouteSeesImages);
    }
  });
});

describe('the label a user is shown names the model that served', () => {
  it('resolves every selected route back to its own catalog entry', () => {
    for (const taskType of ['simple_chat', 'general', 'coding', 'multimodal'] as const) {
      for (const tier of TIERS) {
        const decision = autoRouteFor({ taskType, subscriptionTier: tier });
        if (decision.status !== 'selected') continue;
        const metadata = getModelMetadataById(decision.modelKey);
        expect(metadata, `${taskType}/${tier} -> ${decision.modelKey}`).toBeDefined();
        expect(metadata?.id).toBe(decision.modelKey);
      }
    }
  });

  it('keeps the upstream wire id separate from the label, and never renders the wire id', () => {
    const decision = autoRouteFor({ taskType: 'general', subscriptionTier: 'max' });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;

    const route = registry.routes[decision.routeId];
    expect(route?.modelKey).toBe(decision.modelKey);
    expect(decision.providerModelId).toBe(route?.providerModelId);
    expect(getModelMetadataById(decision.providerModelId)?.id ?? decision.modelKey).toBe(
      decision.modelKey,
    );
  });

  it('gives every live route a label the catalog can render', () => {
    const unlabelled = Object.entries(registry.routes)
      .filter(([, route]) => route.availability === 'live')
      .map(([, route]) => route.modelKey)
      .filter((modelKey) => getModelMetadataById(modelKey) === undefined);

    expect([...new Set(unlabelled)]).toEqual([]);
  });
});
