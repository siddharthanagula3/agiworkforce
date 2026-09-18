import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OPTIONAL_FEATURES,
  OPTIONAL_FEATURE_KEYS,
  describeOptionalFeatureDecisions,
  resolveOptionalFeatures,
  validateOptionalFeatureConfig,
} from '../optional-features';
import { deploymentEnvironment, isProductionRuntime } from '../runtime-environment';

const ENV_EXAMPLE = resolve(__dirname, '../../../.env.example');

const PRODUCTION = { VERCEL_ENV: 'production' } as const;

function withProduction(extra: Record<string, string>) {
  return { ...PRODUCTION, ...extra };
}

describe('optional feature registry', () => {
  it('gives every feature a distinct id and a stated consequence of being off', () => {
    const ids = OPTIONAL_FEATURES.map((feature) => feature.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of OPTIONAL_FEATURES) {
      expect(feature.requires.length, feature.id).toBeGreaterThan(0);
      expect(feature.whenDisabled.trim().length, feature.id).toBeGreaterThan(0);
      for (const requirement of feature.requires) {
        expect(requirement.keys.length, feature.id).toBeGreaterThan(0);
      }
    }
  });

  it('documents every key it enumerates in the environment example', () => {
    const example = readFileSync(ENV_EXAMPLE, 'utf8');
    const undocumented = OPTIONAL_FEATURE_KEYS.filter((key) => !example.includes(key));

    expect(undocumented).toEqual([]);
  });

  it('reaches an explicit enabled or disabled decision for every feature', () => {
    const decisions = describeOptionalFeatureDecisions({});

    expect(decisions).toHaveLength(OPTIONAL_FEATURES.length);
    for (const decision of decisions) {
      expect(decision).toMatch(/: (enabled|disabled)/);
    }
  });

  it('calls a half-configured feature an error in production, not a silent default', () => {
    const result = validateOptionalFeatureConfig(
      withProduction({ WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key' }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('WEB_PUSH_VAPID_PRIVATE_KEY');
    expect(result.errors.join('\n')).toContain('WEB_PUSH_VAPID_SUBJECT');
  });

  it('keeps a half-configured feature to a warning outside production', () => {
    const result = validateOptionalFeatureConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key' });

    expect(result.valid).toBe(true);
    expect(result.warnings.join('\n')).toContain('WEB_PUSH_VAPID_PRIVATE_KEY');
  });

  it('names a feature that is wholly off in production without failing the boot', () => {
    const result = validateOptionalFeatureConfig(PRODUCTION);

    expect(result.valid).toBe(true);
    expect(result.warnings.join('\n')).toContain('Error reporting is off in production');
  });

  it('stays quiet about a feature another validator already reports', () => {
    const result = validateOptionalFeatureConfig(PRODUCTION);

    expect(result.warnings.join('\n')).not.toContain('Place search');
    expect(result.warnings.join('\n')).not.toContain('First-party model provider keys');
  });

  it('treats an alternative as satisfying its group', () => {
    const states = resolveOptionalFeatures({ SENTRY_DSN: 'https://key@sentry.example/1' });
    const reporting = states.find((state) => state.feature.id === 'error_reporting');

    expect(reporting?.enabled).toBe(true);
    expect(reporting?.partial).toBe(false);
  });

  it('ignores a key that is present but blank', () => {
    const states = resolveOptionalFeatures({ E2B_API_KEY: '   ' });
    const execution = states.find((state) => state.feature.id === 'code_execution');

    expect(execution?.enabled).toBe(false);
  });
});

describe('runtime environment', () => {
  it('does not call a production build a production runtime', () => {
    expect(deploymentEnvironment({ NEXT_PHASE: 'phase-production-build' })).toBe('build');
    expect(isProductionRuntime({ NEXT_PHASE: 'phase-production-build' })).toBe(false);
  });

  it('keeps preview out of production even when NODE_ENV says otherwise', () => {
    expect(isProductionRuntime({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(false);
  });

  it('falls back to NODE_ENV where the platform says nothing', () => {
    expect(deploymentEnvironment({ NODE_ENV: 'production' })).toBe('production');
    expect(deploymentEnvironment({})).toBe('development');
  });
});
