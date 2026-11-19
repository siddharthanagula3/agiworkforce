import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDefaultModelFor } from '@agiworkforce/types';

const WEB_APP = join(__dirname, '..', '..');
const REPO_ROOT = join(WEB_APP, '..', '..', '..');

interface Registry {
  developers: Record<string, { label: string }>;
  routes: Record<string, { modelKey: string; provider: string; isDefault: boolean }>;
  policies: {
    auto: {
      tierAllowedSlots: Record<string, string[]>;
      slots: Record<string, { modelKey: string }>;
    };
  };
}

function collapsed(source: string): string {
  return source.replace(/\s+/gu, ' ').replace(/&rsquo;/gu, '’');
}

const privacy = collapsed(readFileSync(join(WEB_APP, 'privacy', 'page.tsx'), 'utf8'));
const registry = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'packages', 'ai', 'model-registry', 'generated', 'registry.json'),
    'utf8',
  ),
) as Registry;

function providersOfFreeModelsBesidesTheDefault(): string[] {
  const auto = registry.policies.auto;
  const defaultModel = getDefaultModelFor('free', 'chat');
  const pickable = [
    ...new Set((auto.tierAllowedSlots['free'] ?? []).map((slot) => auto.slots[slot]?.modelKey)),
  ].filter((model): model is string => Boolean(model) && model !== defaultModel);
  return [
    ...new Set(
      pickable.map((model) => {
        const route = Object.values(registry.routes).find(
          (candidate) => candidate.modelKey === model && candidate.isDefault,
        );
        expect(route, `${model} has no default route`).toBeDefined();
        const label = registry.developers[route!.provider]?.label;
        expect(label, `${route!.provider} has no display label`).toBeDefined();
        return label!;
      }),
    ),
  ];
}

describe('/privacy, the Free plan models', () => {
  it('says AGI chooses only the default model and the person may pick another, with no size for the allowance', () => {
    expect(privacy).toContain(
      'On the Free plan, AGI chooses the default model and you may pick another model the plan includes, within a usage allowance.',
    );
    expect(privacy).not.toMatch(
      /runs on a model AGI chooses|small usage allowance|paid plans with more capacity/u,
    );
  });

  it('names the provider of every Free model a person may pick besides the default', () => {
    const providers = providersOfFreeModelsBesidesTheDefault();
    expect(providers.length).toBeGreaterThan(0);
    const named = providers.join(' or ');
    expect(privacy).toContain(
      `A Free account may also pick a model from ${named}, and a chat on it goes to ${named}.`,
    );
  });
});
