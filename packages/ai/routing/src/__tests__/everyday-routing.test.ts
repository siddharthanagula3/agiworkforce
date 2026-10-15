import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';
import {
  getModelMetadataById,
  getRoutingSlotModel,
  resolveModelFamilySlot,
} from '@agiworkforce/types';

import { resolveAutoRoute, type AutoRoutingRequest, type RoutingTrustMode } from '../auto';
import type { RoutingTaskType } from '../types';

interface PolicyView {
  tierAllowedSlots: Record<string, string[]>;
  slots: Record<string, { modelKey: string }>;
  slotBackups?: Record<string, string[]>;
  aliases: Record<string, unknown>;
}

const policy = (modelRegistry as unknown as { policies: { auto: PolicyView } }).policies.auto;

const PAID_TIERS = ['basic', 'pro', 'max', 'enterprise'] as const;
const EVERYDAY_TASKS = ['simple_chat', 'general', 'creative_writing'] as const;
const ALL_TASKS: readonly RoutingTaskType[] = [
  'simple_chat',
  'general',
  'coding',
  'reasoning',
  'creative_writing',
  'multimodal',
  'long_context',
  'research',
  'agentic',
  'computer-use',
  'image_generation',
];
const ALL_TIERS = ['free', 'basic', 'pro', 'max', 'max_15x', 'enterprise', 'byok'] as const;

const EVERYDAY_MODEL = resolveModelFamilySlot('openai/gpt-fast');
const FLAT_BACKUP_MODEL = resolveModelFamilySlot('qwen/qwen-flash');
const FLAGSHIP_MODELS = Object.keys(modelRegistry.models).filter(
  (modelKey) => getModelMetadataById(modelKey)?.tierPolicy?.minTier === 'max',
);

function webAuto(overrides: Partial<AutoRoutingRequest>): AutoRoutingRequest {
  return {
    selection: 'auto',
    taskType: 'general',
    subscriptionTier: 'pro',
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
    enableTaskFamilyStage: false,
    ...overrides,
  };
}

function firstPricingTierThreshold(modelKey: string): number {
  const tiers = getModelMetadataById(modelKey)?.inputTokenPricingTiers ?? [];
  const [first] = [...tiers].sort((a, b) => a.thresholdTokens - b.thresholdTokens);
  if (!first) throw new Error(`${modelKey} has no input-length pricing tier in the catalog`);
  return first.thresholdTokens;
}

describe('everyday chat on paid plans', () => {
  it('serves the everyday slots from the fast OpenAI family', () => {
    expect(getRoutingSlotModel('workhorse_general')).toBe(EVERYDAY_MODEL);
    expect(getRoutingSlotModel('coding_fast')).toBe(EVERYDAY_MODEL);
  });

  it.each(PAID_TIERS.flatMap((tier) => EVERYDAY_TASKS.map((task) => [tier, task] as const)))(
    'routes %s %s to the everyday model in the economy band',
    (subscriptionTier, taskType) => {
      const decision = resolveAutoRoute(webAuto({ subscriptionTier, taskType }));
      expect(decision).toMatchObject({
        status: 'selected',
        modelKey: EVERYDAY_MODEL,
        effectiveProfile: 'economy',
      });
    },
  );

  it('keeps Free on its own slots', () => {
    const decision = resolveAutoRoute(webAuto({ subscriptionTier: 'free' }));
    expect(decision).toMatchObject({
      status: 'selected',
      modelKey: getRoutingSlotModel('free_workhorse'),
    });
  });
});

describe('backups', () => {
  it.each(PAID_TIERS)('offers the flat-priced backup first on %s', (subscriptionTier) => {
    const decision = resolveAutoRoute(webAuto({ subscriptionTier }));
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    const substitutes = decision.fallbacks.filter((entry) => entry.modelKey !== EVERYDAY_MODEL);
    expect(substitutes[0]?.modelKey).toBe(FLAT_BACKUP_MODEL);
  });

  it('never offers Basic a backup outside the slots its plan is granted', () => {
    const basicModels = new Set(
      policy.tierAllowedSlots.basic!.map((slotId) => policy.slots[slotId]!.modelKey),
    );
    for (const taskType of ALL_TASKS) {
      const decision = resolveAutoRoute(webAuto({ subscriptionTier: 'basic', taskType }));
      if (decision.status !== 'selected') continue;
      for (const fallback of [decision, ...decision.fallbacks]) {
        expect(basicModels.has(fallback.modelKey), `${taskType}: ${fallback.modelKey}`).toBe(true);
      }
    }
  });

  it('declares only backup slots that exist in the policy', () => {
    for (const [slotId, backups] of Object.entries(policy.slotBackups ?? {})) {
      expect(policy.slots[slotId], slotId).toBeDefined();
      for (const backupId of backups) expect(policy.slots[backupId], backupId).toBeDefined();
    }
  });
});

describe('Auto never reaches a flagship on its own', () => {
  const aliases = Object.keys(policy.aliases);
  const trustModes: readonly RoutingTrustMode[] = ['managed_cloud', 'byok'];

  it('picks no flagship and lists none as a fallback, on any plan, task or alias', () => {
    let checked = 0;
    for (const selection of aliases) {
      for (const subscriptionTier of ALL_TIERS) {
        for (const taskType of ALL_TASKS) {
          for (const trustMode of trustModes) {
            const decision = resolveAutoRoute({
              selection,
              taskType,
              subscriptionTier,
              trustMode,
            });
            if (decision.status !== 'selected') continue;
            checked += 1;
            const reached = [decision.modelKey, ...decision.fallbacks.map((f) => f.modelKey)];
            for (const flagship of FLAGSHIP_MODELS) {
              expect(
                reached,
                `${selection}/${subscriptionTier}/${taskType}/${trustMode}`,
              ).not.toContain(flagship);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('still serves a flagship the user picks by name on Max', () => {
    for (const flagship of FLAGSHIP_MODELS) {
      const decision = resolveAutoRoute({
        selection: flagship,
        taskType: 'coding',
        subscriptionTier: 'max',
        trustMode: 'managed_cloud',
      });
      expect(decision, flagship).toMatchObject({
        status: 'selected',
        modelKey: flagship,
        reason: 'explicit',
      });
    }
  });
});

describe('input-length pricing tiers', () => {
  const threshold = firstPricingTierThreshold(EVERYDAY_MODEL);

  it('keeps the everyday model at its tier threshold', () => {
    const decision = resolveAutoRoute(
      webAuto({ subscriptionTier: 'basic', estimatedInputTokens: threshold }),
    );
    expect(decision).toMatchObject({ status: 'selected', modelKey: EVERYDAY_MODEL });
  });

  it('moves a prompt past the threshold to the flat-priced backup', () => {
    expect(getModelMetadataById(FLAT_BACKUP_MODEL)?.inputTokenPricingTiers ?? []).toEqual([]);
    for (const subscriptionTier of PAID_TIERS) {
      const decision = resolveAutoRoute(
        webAuto({ subscriptionTier, estimatedInputTokens: threshold + 1 }),
      );
      expect(decision, subscriptionTier).toMatchObject({
        status: 'selected',
        modelKey: FLAT_BACKUP_MODEL,
        reason: 'price_tier_backup',
      });
      if (decision.status !== 'selected') continue;
      const substitutes = decision.fallbacks.filter((f) => f.modelKey !== FLAT_BACKUP_MODEL);
      expect(substitutes[0]?.modelKey).toBe(EVERYDAY_MODEL);
    }
  });

  it('stays on the everyday model when its warm cache keeps it cheaper past the threshold', () => {
    const cold = resolveAutoRoute(webAuto({ subscriptionTier: 'pro' }));
    if (cold.status !== 'selected') throw new Error('expected a selected route');
    const warm = resolveAutoRoute(
      webAuto({
        subscriptionTier: 'pro',
        estimatedInputTokens: threshold + 1,
        preferredRouteId: cold.routeId,
      }),
    );
    expect(warm).toMatchObject({ status: 'selected', modelKey: EVERYDAY_MODEL });
  });

  it('leaves a task whose slot declares no backup on its own model', () => {
    const decision = resolveAutoRoute(
      webAuto({ subscriptionTier: 'pro', taskType: 'coding', estimatedInputTokens: threshold + 1 }),
    );
    expect(decision).toMatchObject({
      status: 'selected',
      modelKey: getRoutingSlotModel('coding_balanced'),
    });
  });

  it('does not offer a backup that would itself step up for a prompt this long', () => {
    const decision = resolveAutoRoute(
      webAuto({ subscriptionTier: 'pro', estimatedInputTokens: threshold + 1 }),
    );
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    for (const fallback of decision.fallbacks) {
      const backupSlots = policy.slotBackups?.workhorse_general ?? [];
      const isBackup = backupSlots.some(
        (slotId) => policy.slots[slotId]?.modelKey === fallback.modelKey,
      );
      if (!isBackup) continue;
      expect(getModelMetadataById(fallback.modelKey)?.inputTokenPricingTiers ?? []).toEqual([]);
    }
  });
});
