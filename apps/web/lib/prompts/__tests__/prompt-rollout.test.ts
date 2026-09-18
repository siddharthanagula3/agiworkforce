import { canaryBucket } from '@agiworkforce/routing';
import { describe, expect, it } from 'vitest';

import { PROMPT_IDS, PROMPT_MANIFEST, type PromptId } from '../prompt-manifest';
import { resolvePrompt } from '../prompt-registry';

function firstPromptId(): PromptId {
  const [id] = PROMPT_IDS;
  if (id === undefined) throw new Error('the prompt manifest declares no prompts');
  return id;
}

const ID = firstPromptId();
const PINNED = PROMPT_MANIFEST[ID].pinnedVersion;
const WITHDRAWN = 9999;

function subjects(count: number): string[] {
  return [...Array(count).keys()].map((index) => `req-${index}`);
}

describe('staged prompt rollout', () => {
  it('stamps the channel on every resolution, pinned included', () => {
    const resolved = resolvePrompt(ID);
    expect(resolved).toMatchObject({ selectedBy: 'pinned', channel: 'stable' });
    expect(resolved.stamp).toBe(`${ID}@${PINNED}`);
  });

  it('serves the rollout to the subjects the split selects and nobody else', () => {
    const fraction = 0.1;
    const rollouts = { [ID]: { version: PINNED, trafficFraction: fraction } };
    for (const requestId of subjects(200)) {
      const resolved = resolvePrompt(ID, { rollouts, requestId });
      const selected = canaryBucket(`${ID}:${requestId}`) < fraction;
      expect(resolved.selectedBy, requestId).toBe(selected ? 'rollout' : 'pinned');
      expect(resolved.channel, requestId).toBe(selected ? 'canary' : 'stable');
    }
  });

  it('splits at roughly the declared fraction and is stable per subject', () => {
    const rollouts = { [ID]: { version: PINNED, trafficFraction: 0.25 } };
    const served = subjects(2000).filter(
      (requestId) => resolvePrompt(ID, { rollouts, requestId }).selectedBy === 'rollout',
    );
    expect(served.length).toBeGreaterThan(400);
    expect(served.length).toBeLessThan(600);
    const first = resolvePrompt(ID, { rollouts, requestId: served[0] });
    expect(resolvePrompt(ID, { rollouts, requestId: served[0] })).toEqual(first);
  });

  it('puts the same subject on different sides for different prompts at the same fraction', () => {
    const fraction = 0.5;
    const sides = PROMPT_IDS.slice(0, 8).map(
      (id) =>
        resolvePrompt(id, {
          rollouts: {
            [id]: { version: PROMPT_MANIFEST[id].pinnedVersion, trafficFraction: fraction },
          },
          requestId: 'one-subject',
        }).channel,
    );
    expect(new Set(sides).size).toBe(2);
  });

  it('never serves a rollout without a request id or at a zero fraction', () => {
    const rollouts = { [ID]: { version: PINNED, trafficFraction: 1 } };
    expect(resolvePrompt(ID, { rollouts }).selectedBy).toBe('pinned');
    expect(resolvePrompt(ID, { rollouts, requestId: '' }).selectedBy).toBe('pinned');
    expect(
      resolvePrompt(ID, {
        rollouts: { [ID]: { version: PINNED, trafficFraction: 0 } },
        requestId: 'req-1',
      }).selectedBy,
    ).toBe('pinned');
  });

  it('falls back to the pinned version when the rollout names one that was withdrawn', () => {
    const resolved = resolvePrompt(ID, {
      rollouts: { [ID]: { version: WITHDRAWN, trafficFraction: 1 } },
      requestId: 'req-1',
    });
    expect(resolved).toMatchObject({ version: PINNED, selectedBy: 'pinned', channel: 'stable' });
  });

  it('lets a deliberate variant override a rollout', () => {
    const resolved = resolvePrompt(ID, {
      variants: { [ID]: PINNED },
      rollouts: { [ID]: { version: WITHDRAWN, trafficFraction: 1 } },
      requestId: 'req-1',
    });
    expect(resolved).toMatchObject({ selectedBy: 'variant', channel: 'stable' });
  });
});
