import { afterEach, describe, expect, it } from 'vitest';
import { resolveAutoRoute } from '@agiworkforce/routing';
import { resolveModelFamilySlot } from '@agiworkforce/types';
import { isSupportAgentEnabled, SUPPORT_MODEL_FAMILY } from '../answer/model-route';

describe('support model route (real router)', () => {
  it.each(['free', 'pro', 'max'])('resolves a managed cloud route on the %s tier', (tier) => {
    const route = resolveAutoRoute({
      selection: resolveModelFamilySlot(SUPPORT_MODEL_FAMILY),
      taskType: 'simple_chat',
      subscriptionTier: tier,
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });

    expect(route.status).toBe('selected');
    if (route.status !== 'selected') return;
    expect(route.modelKey).toBe(resolveModelFamilySlot(SUPPORT_MODEL_FAMILY));
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

  it('defaults to ON when unset, so the assistant answers without extra configuration', () => {
    delete process.env['SUPPORT_AGENT_ENABLED'];
    expect(isSupportAgentEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', 'no', ' OFF '])('turns off for %j', (value) => {
    process.env['SUPPORT_AGENT_ENABLED'] = value;
    expect(isSupportAgentEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'on', 'YES', ''])('stays on for %j', (value) => {
    process.env['SUPPORT_AGENT_ENABLED'] = value;
    expect(isSupportAgentEnabled()).toBe(true);
  });
});
