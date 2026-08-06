/**
 * The model-access assumption, asserted against the REAL router.
 *
 * The design inferred that `resolveAutoRoute` would resolve for
 * `{ taskType: 'simple_chat', trustMode: 'managed_cloud',
 *    runtimeProfileId: 'web/cloud-chat' }` on a free tier. Inference is not
 * evidence, so this pins it — with `resolveAutoRoute` UNMOCKED. If the routing
 * policy stops resolving for a support turn, this fails here rather than
 * silently turning every production answer into a `model_unavailable`
 * abstention.
 *
 * It deliberately asserts no model id: ids come from the registry, never from a
 * literal.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resolveAutoRoute } from '@agiworkforce/routing';
import { isSupportAgentEnabled } from '../answer/model-route';

describe('support model route (real router)', () => {
  it.each(['free', 'pro', 'max'])('resolves a managed cloud route on the %s tier', (tier) => {
    const route = resolveAutoRoute({
      selection: 'auto',
      taskType: 'simple_chat',
      subscriptionTier: tier,
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });

    expect(route.status).toBe('selected');
    if (route.status !== 'selected') return;
    expect(route.provider.length).toBeGreaterThan(0);
    expect(route.modelKey.length).toBeGreaterThan(0);
    expect(route.providerModelId.length).toBeGreaterThan(0);
    expect(route.harnessId.endsWith('/media')).toBe(false);
  });
});

describe('SUPPORT_AGENT_ENABLED kill switch', () => {
  const original = process.env['SUPPORT_AGENT_ENABLED'];

  afterEach(() => {
    if (original === undefined) delete process.env['SUPPORT_AGENT_ENABLED'];
    else process.env['SUPPORT_AGENT_ENABLED'] = original;
  });

  it('defaults to OFF when unset, so an unconfigured deploy spends nothing', () => {
    delete process.env['SUPPORT_AGENT_ENABLED'];
    expect(isSupportAgentEnabled()).toBe(false);
  });

  it.each(['0', 'false', 'off', '', 'maybe', 'no'])('stays off for %j', (value) => {
    process.env['SUPPORT_AGENT_ENABLED'] = value;
    expect(isSupportAgentEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'on', 'YES', ' True '])('turns on for %j', (value) => {
    process.env['SUPPORT_AGENT_ENABLED'] = value;
    expect(isSupportAgentEnabled()).toBe(true);
  });
});
