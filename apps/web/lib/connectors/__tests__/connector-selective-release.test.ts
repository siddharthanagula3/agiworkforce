import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SELECTIVELY_RELEASED_CONNECTOR_IDS } from '@agiworkforce/types';

type GateModule = typeof import('@/lib/feature-flags/capability-gate');

const readKillSwitchGate = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/feature-flags/capability-gate', async (importOriginal) => ({
  ...(await importOriginal<GateModule>()),
  readKillSwitchGate,
}));

import {
  assertConnectorsReleased,
  connectorsAllowedForTurn,
  connectorsAllowedWithoutRequest,
} from '@/lib/connectors/connector-capability';

const request = new NextRequest('https://app.example.com/api/llm/v1/chat/completions');
const USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  readKillSwitchGate.mockResolvedValue({ capabilityAllowed: () => true });
});

describe('selected connector eligibility', () => {
  it('requires an explicit ordinary-chat opt-in before consulting the kill switch', async () => {
    await expect(
      connectorsAllowedForTurn(request, USER, {
        subscriptionTier: 'pro',
        chatSurface: 'web',
      }),
    ).resolves.toBe(false);
    await expect(
      connectorsAllowedForTurn(request, USER, {
        subscriptionTier: 'pro',
        chatSurface: 'web',
        allowSelective: false,
      }),
    ).resolves.toBe(false);
    expect(readKillSwitchGate).not.toHaveBeenCalled();

    await expect(
      connectorsAllowedForTurn(request, USER, {
        subscriptionTier: 'pro',
        chatSurface: 'web',
        allowSelective: true,
      }),
    ).resolves.toBe(true);
    expect(readKillSwitchGate).toHaveBeenCalledTimes(1);
  });

  it('keeps generic background and custom entry points on the full-launch gate', async () => {
    await expect(
      connectorsAllowedWithoutRequest({
        userId: USER,
        organizationId: null,
        planTier: 'pro',
      }),
    ).resolves.toBe(false);
    expect(() => assertConnectorsReleased()).toThrow('Connectors are coming soon.');
    expect(readKillSwitchGate).not.toHaveBeenCalled();
  });

  it.each(SELECTIVELY_RELEASED_CONNECTOR_IDS)(
    'checks plan and the kill switch for %s admission',
    async (connectorId) => {
      await expect(
        connectorsAllowedWithoutRequest({
          userId: USER,
          organizationId: 'org-1',
          planTier: 'pro',
          surface: 'web',
          connectorId,
        }),
      ).resolves.toBe(true);
      expect(readKillSwitchGate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER,
          workspaceId: 'org-1',
          plan: 'pro',
          surface: 'web',
        }),
      );
    },
  );

  it.each([
    'gmail',
    'github',
    'huggingface',
    'stripe',
    'dir-notion',
    'custom-notion',
    'org-notion',
    null,
  ])('refuses %j admission before reading the kill switch', async (connectorId) => {
    await expect(
      connectorsAllowedWithoutRequest({
        userId: USER,
        organizationId: null,
        planTier: 'enterprise',
        connectorId,
      }),
    ).resolves.toBe(false);
    expect(readKillSwitchGate).not.toHaveBeenCalled();
  });

  it('does not bypass paid-plan eligibility for selective chat or individual admission', async () => {
    await expect(
      connectorsAllowedForTurn(request, USER, {
        subscriptionTier: 'free',
        chatSurface: 'web',
        allowSelective: true,
      }),
    ).resolves.toBe(false);
    await expect(
      connectorsAllowedWithoutRequest({
        userId: USER,
        organizationId: null,
        planTier: null,
        connectorId: 'notion',
      }),
    ).resolves.toBe(false);
    expect(readKillSwitchGate).not.toHaveBeenCalled();
  });

  it('fails closed when the kill switch is disabled or unreadable', async () => {
    readKillSwitchGate.mockResolvedValueOnce({ capabilityAllowed: () => false });
    await expect(
      connectorsAllowedForTurn(request, USER, {
        subscriptionTier: 'pro',
        chatSurface: 'web',
        allowSelective: true,
      }),
    ).resolves.toBe(false);
    readKillSwitchGate.mockRejectedValueOnce(new Error('gate unavailable'));
    await expect(
      connectorsAllowedWithoutRequest({
        userId: USER,
        organizationId: null,
        planTier: 'pro',
        connectorId: 'linear',
      }),
    ).resolves.toBe(false);
  });
});
