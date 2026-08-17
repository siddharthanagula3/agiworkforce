import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelsCatalogJson } from '@agiworkforce/types';
import {
  CATALOG_AS_OF,
  COMING_SOON_LABEL,
  DESKTOP_LOCAL_RUNTIMES,
  LAUNCH,
  MARKETING,
  MARKETING_FEATURE_MATRIX,
  SURFACE_STATUS,
} from '../marketing-constants';

const repoRoot = resolve(import.meta.dirname, '../../../..');

function shippedVersion(manifestPath: string): string {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8')) as {
    version?: string;
  };
  if (!manifest.version) throw new Error(`${manifestPath} declares no version`);
  return manifest.version;
}

describe('marketing plan matrix', () => {
  it('uses the founder-approved shared catalog labels and prices', () => {
    expect(MARKETING_FEATURE_MATRIX.team).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ planId: 'pro', label: 'Pro', price: '$20/mo' }),
        expect.objectContaining({ planId: 'max', label: 'Max 5x', price: '$100/mo' }),
        expect.objectContaining({ planId: 'max_15x', label: 'Max 15x', price: '$200/mo' }),
        expect.objectContaining({
          planId: 'team',
          label: 'Team',
          price: '$25/seat/mo',
          billingInterval: 'Self-serve monthly; annual only where checkout offers it',
        }),
      ]),
    );
  });

  it('does not expose a retired Hobby or Max 20x plan', () => {
    const serialized = JSON.stringify(MARKETING_FEATURE_MATRIX);
    expect(serialized).not.toMatch(/hobby/i);
    expect(serialized).not.toMatch(/20x/i);
  });
});

describe('launch messaging', () => {
  it('carries no calendar date', () => {
    const serialized = JSON.stringify(LAUNCH);
    expect(serialized).not.toMatch(
      /january|february|march|april|may|june|july|august|september|october|november|december/i,
    );
    expect(serialized).not.toMatch(/\b20\d{2}\b/);
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('still provides the labels the marketing pages render', () => {
    expect(LAUNCH.publicLabel).toBeTruthy();
    expect(LAUNCH.shortLabel).toBeTruthy();
    expect(LAUNCH.ctaLabel).toBeTruthy();
  });
});

describe('model and provider counts', () => {
  it('derives the model count from the canonical catalog', () => {
    expect(MARKETING.models.count).toBe(Object.keys(modelsCatalogJson.models).length);
    expect(MARKETING.models.display).toBe(String(MARKETING.models.count));
  });

  it('derives the provider count from the canonical catalog', () => {
    expect(MARKETING.providers.count).toBe(Object.keys(modelsCatalogJson.providers).length);
  });

  it('keeps the conservative provider floor truthful', () => {
    const floor = Number(MARKETING.providers.display.replace(/\D/g, ''));
    expect(Number.isFinite(floor)).toBe(true);
    expect(MARKETING.providers.count).toBeGreaterThanOrEqual(floor);
  });

  it('dates the catalog from its own lastUpdated stamp', () => {
    expect(CATALOG_AS_OF).toBe(modelsCatalogJson.lastUpdated);
    expect(CATALOG_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('derives the four verified Desktop local-runtime labels from the catalog', () => {
    expect(DESKTOP_LOCAL_RUNTIMES.names).toEqual(['Ollama', 'LM Studio', 'llama.cpp', 'vLLM']);
    expect(DESKTOP_LOCAL_RUNTIMES.label).toBe('Ollama, LM Studio, llama.cpp, and vLLM');
    for (const providerId of ['ollama', 'lmstudio', 'llamacpp', 'vllm'] as const) {
      expect(modelsCatalogJson.providers[providerId].label).toContain('(Local)');
    }
  });
});

describe('surface availability', () => {
  it('does not mark every surface as unreleased', () => {
    const statuses = Object.values(SURFACE_STATUS);
    expect(statuses.every((status) => status === COMING_SOON_LABEL)).toBe(false);
  });

  it('states the three shipped surfaces as available, at the version each one actually ships', () => {
    expect(SURFACE_STATUS.web).not.toBe(COMING_SOON_LABEL);
    expect(SURFACE_STATUS.desktop).toContain(shippedVersion('apps/desktop/package.json'));
    expect(SURFACE_STATUS.cli).toContain(shippedVersion('apps/cli/npm/package.json'));
  });

  it('keeps the three surfaces with no release tag marked unreleased', () => {
    expect(SURFACE_STATUS.mobile).toBe(COMING_SOON_LABEL);
    expect(SURFACE_STATUS.vscode).toBe(COMING_SOON_LABEL);
    expect(SURFACE_STATUS.chrome).toBe(COMING_SOON_LABEL);
  });

  it('covers all six surfaces', () => {
    expect(Object.keys(SURFACE_STATUS)).toHaveLength(MARKETING.surfaces.count);
  });
});
