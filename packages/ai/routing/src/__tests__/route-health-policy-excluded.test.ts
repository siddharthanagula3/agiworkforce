import { describe, expect, it } from 'vitest';

import {
  buildRouteHealthSnapshot,
  isCredentialUnfunded,
  isRouteBreakerOpen,
  isRoutePolicyExcluded,
} from '../route-health-store';
import { observedRouteHealthFromSnapshots } from '../auto';
import type { RouteOutcomeClass } from '../runtime-state';

/**
 * `AGI-23`. A provider answering "no endpoints match your data policy" is
 * telling us something permanent: the setting is on our own account, so the
 * next attempt gets the same answer, and the one after that. It used to be
 * recorded as an ordinary server error, which means the route stayed in the
 * rotation until it had failed enough times to trip the breaker on a streak,
 * and every turn in between spent a round trip rediscovering it.
 *
 * The requirement is one observation withdrawing the route. That is the same
 * shape as an unfunded credential, and deliberately NOT the same as a discount
 * being unavailable, which genuinely comes back.
 */
const NOW = 1_800_000_000_000;

function eventsOf(classes: readonly RouteOutcomeClass[]) {
  return classes.map((cls, index) => ({
    class: cls,
    nowMs: NOW - (classes.length - index) * 1_000,
  }));
}

describe('a route excluded by our own data policy', () => {
  it('is withdrawn on the first refusal', () => {
    const snapshot = buildRouteHealthSnapshot(eventsOf(['policy_excluded']), NOW);

    expect(isRoutePolicyExcluded(snapshot)).toBe(true);
  });

  it('does not need a failure streak first', () => {
    const streak = buildRouteHealthSnapshot(eventsOf(['server_error']), NOW);

    // One ordinary failure is not enough to open the breaker, which is exactly
    // why a permanent refusal needed its own class.
    expect(isRouteBreakerOpen(streak)).toBe(false);
    expect(isRoutePolicyExcluded(streak)).toBe(false);
  });

  it('is not reported as a credential problem, which wants a different repair', () => {
    const snapshot = buildRouteHealthSnapshot(eventsOf(['policy_excluded']), NOW);

    expect(isCredentialUnfunded(snapshot)).toBe(false);
  });

  it('clears once the route serves again, so a settings change is not sticky', () => {
    const snapshot = buildRouteHealthSnapshot(eventsOf(['policy_excluded', 'success']), NOW);

    expect(isRoutePolicyExcluded(snapshot)).toBe(false);
  });

  it('reports nothing for a route that has never been tried', () => {
    expect(isRoutePolicyExcluded(buildRouteHealthSnapshot([], NOW))).toBe(false);
    expect(isRoutePolicyExcluded(undefined)).toBe(false);
  });
});

describe('the resolver stops offering an excluded route', () => {
  it('marks it excluded for admission', () => {
    const observed = observedRouteHealthFromSnapshots(
      {},
      undefined,
      new Set(['openrouter:some-model']),
    );

    expect(observed['openrouter:some-model']).toMatchObject({ policyExcluded: true });
  });

  it('marks it even with no samples, because the provider already answered', () => {
    const observed = observedRouteHealthFromSnapshots(
      { 'openrouter:some-model': buildRouteHealthSnapshot([], NOW) },
      undefined,
      new Set(['openrouter:some-model']),
    );

    expect(observed['openrouter:some-model']?.policyExcluded).toBe(true);
  });

  it('keeps the two exclusions distinct', () => {
    const observed = observedRouteHealthFromSnapshots(
      {},
      new Set(['openai:unfunded-route']),
      new Set(['openrouter:excluded-route']),
    );

    expect(observed['openai:unfunded-route']).toMatchObject({ credentialUnfunded: true });
    expect(observed['openai:unfunded-route']?.policyExcluded).toBeUndefined();
    expect(observed['openrouter:excluded-route']).toMatchObject({ policyExcluded: true });
    expect(observed['openrouter:excluded-route']?.credentialUnfunded).toBeUndefined();
  });

  it('leaves every other route untouched', () => {
    const observed = observedRouteHealthFromSnapshots({}, undefined, new Set(['a']));

    expect(Object.keys(observed)).toEqual(['a']);
  });
});
