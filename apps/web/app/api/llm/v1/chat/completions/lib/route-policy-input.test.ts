import { describe, expect, it, vi } from 'vitest';
import { listCanonicalModels, type Provider } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import type { ModelAccessPolicy } from '@agiworkforce/routing';

import { resolveWebCloudModelRoute } from './request-processor';

const AUTO_SELECTION = 'auto';
const TASK_TYPE = 'general' as const;
const TIER = 'max';

function ungoverned() {
  return resolveWebCloudModelRoute(AUTO_SELECTION, TIER, TASK_TYPE);
}

function governed(policy: Partial<ModelAccessPolicy>) {
  return resolveWebCloudModelRoute(
    AUTO_SELECTION,
    TIER,
    TASK_TYPE,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { allowedProviders: [], blockedProviders: [], allowedModels: [], blockedModels: [], ...policy },
  );
}

function providerOf(routeId: string): Provider {
  return routeId.slice(0, routeId.indexOf('/')) as Provider;
}

describe('workspace model policy as a router input', () => {
  it('changes nothing when the workspace is ungoverned', () => {
    expect(governed({})).toEqual(ungoverned());
  });

  it('never serves a blocked provider, as head or as a fallback', () => {
    const base = ungoverned();
    expect(base.status).toBe('selected');
    if (base.status !== 'selected') return;

    const blocked = providerOf(base.routeId);
    const decision = governed({ blockedProviders: [blocked] });

    if (decision.status === 'selected') {
      expect(providerOf(decision.routeId)).not.toBe(blocked);
      for (const fallback of decision.fallbacks) {
        expect(fallback.provider).not.toBe(blocked);
      }
    }
  });

  it('never puts a blocked model in the plan', () => {
    const base = ungoverned();
    if (base.status !== 'selected') return;

    const decision = governed({ blockedModels: [base.modelKey] });

    if (decision.status === 'selected') {
      expect(decision.modelKey).not.toBe(base.modelKey);
      expect(decision.fallbacks.map((fallback) => fallback.modelKey)).not.toContain(base.modelKey);
    }
  });

  it('keeps a model an administrator explicitly allowed despite blocking its vendor', () => {
    const base = ungoverned();
    if (base.status !== 'selected') return;

    const decision = governed({
      blockedProviders: [providerOf(base.routeId)],
      allowedModels: [base.modelKey],
    });

    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.modelKey).toBe(base.modelKey);
  });

  it('refuses rather than substituting when the allowlist admits nothing', () => {
    const unknownProvider = listCanonicalModels()
      .map((model) => model.provider)
      .join('-') as ModelAccessPolicy['allowedProviders'][number];
    const decision = governed({ allowedProviders: [unknownProvider] });

    expect(decision.status).toBe('unavailable');
  });
});
