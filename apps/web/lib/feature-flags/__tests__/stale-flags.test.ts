import { describe, expect, it } from 'vitest';

import type { FlagDefinition } from '../flag-definition';
import { FeatureFlagConfigSchema, readFeatureFlagConfig } from '../flag-config';
import { killSwitchDefinition } from '../kill-switches';
import { archivableStaleFlags, findStaleFlags } from '../stale-flags';

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const DAY_MS = 86_400_000;
const CONFIG = FeatureFlagConfigSchema.parse({});

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

function definition(key: string, patch: Partial<FlagDefinition> = {}): FlagDefinition {
  return {
    ...killSwitchDefinition(key, `switch for ${key}`),
    version: 1,
    archivedAt: null,
    createdAt: daysAgo(200),
    updatedAt: daysAgo(1),
    ...patch,
  };
}

describe('stale flag detection', () => {
  it('names a flag whose window has closed', () => {
    const stale = findStaleFlags(
      [definition('capability.work', { expiresAt: daysAgo(3) })],
      NOW,
      CONFIG,
    );

    expect(stale).toEqual([expect.objectContaining({ key: 'capability.work', reason: 'expired' })]);
  });

  it('names a flag that has served one answer to everyone for longer than the window', () => {
    const stale = findStaleFlags(
      [definition('composer.voice_mode', { updatedAt: daysAgo(120) })],
      NOW,
      CONFIG,
    );

    expect(stale[0]).toMatchObject({ reason: 'fully_rolled_out', ageDays: 120 });
  });

  it('names a kill switch nobody has revisited, and never archives it automatically', () => {
    const stale = findStaleFlags(
      [definition('capability.browser', { killSwitch: true, updatedAt: daysAgo(90) })],
      NOW,
      CONFIG,
    );

    expect(stale[0]).toMatchObject({ reason: 'killed_and_forgotten' });
    expect(archivableStaleFlags(stale, CONFIG)).toEqual([]);
  });

  it('leaves a young flag, a targeted flag and an archived flag alone', () => {
    const stale = findStaleFlags(
      [
        definition('rollout.new_picker', { updatedAt: daysAgo(3) }),
        definition('rollout.targeted', {
          updatedAt: daysAgo(200),
          rules: [{ id: 'canary', conditions: {}, bucketBy: 'user', variant: 'on' }],
        }),
        definition('rollout.gone', { updatedAt: daysAgo(200), archivedAt: daysAgo(10) }),
      ],
      NOW,
      CONFIG,
    );

    expect(stale).toEqual([]);
  });

  it('caps one cleanup run at the configured batch size', () => {
    const definitions = Array.from({ length: 40 }, (_unused, index) =>
      definition(`rollout.flag_${index}`, { updatedAt: daysAgo(200) }),
    );

    const archivable = archivableStaleFlags(findStaleFlags(definitions, NOW, CONFIG), CONFIG);

    expect(archivable).toHaveLength(CONFIG.staleCleanupBatch);
  });
});

describe('feature flag configuration schema', () => {
  it('reads the tunables from the environment', () => {
    const config = readFeatureFlagConfig({
      FEATURE_FLAG_STALE_AFTER_DAYS: '30',
      FEATURE_FLAG_STALE_CLEANUP_BATCH: '5',
      FEATURE_FLAG_DEFINITION_CACHE_TTL_MS: '1000',
    });

    expect(config).toEqual({
      staleAfterDays: 30,
      staleCleanupBatch: 5,
      definitionCacheTtlMs: 1000,
    });
  });

  it('keeps the shipped defaults when a value is missing or unusable', () => {
    expect(readFeatureFlagConfig({})).toEqual(CONFIG);
    expect(readFeatureFlagConfig({ FEATURE_FLAG_STALE_AFTER_DAYS: 'soon' })).toEqual(CONFIG);
    expect(readFeatureFlagConfig({ FEATURE_FLAG_STALE_AFTER_DAYS: '0' })).toEqual(CONFIG);
  });
});
