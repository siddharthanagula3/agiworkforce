/**
 * sidebarPaywallGuard.test.ts — Tests for the Pro+ paywall guard in _handleSendMessage
 *
 * Exercises the guardProviderSwitch + resolveTier integration point added in P0-F.
 * Two describe blocks:
 *   1. Guard integration — mocks resolveTier, tests the sidebar dispatch logic.
 *   2. Tier workspace-spoofing regression — does NOT mock resolveTier; exercises
 *      the real resolver with a controlled vscode.workspace stub to prove that a
 *      workspace-scoped "agiWorkforce.tier": "max" cannot escalate the tier above
 *      the global default (regression for the workspace-bypass identified in review).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guardProviderSwitch } from '../services/providerSwitchGuard';
import { resolveTier, type Tier } from '../services/tierResolver';
import * as vscode from 'vscode';

// ─── Mock tierResolver bridge fetch so integration tests are offline ──────────

vi.mock('../services/tierResolver', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/tierResolver')>();
  return {
    ...original,
    resolveTier: vi.fn().mockResolvedValue('byok' as Tier),
  };
});

// ─── Paywall guard integration (simulates sidebar sendMessage handler) ────────

async function simulateSendMessage(
  activeModel: string,
  incomingModel: string,
  mockContext: unknown,
): Promise<{ blocked: boolean; activeModelAfter: string }> {
  const tier = await resolveTier(mockContext as import('vscode').ExtensionContext);
  const guardResult = guardProviderSwitch(activeModel, incomingModel, tier);
  if (guardResult === 'upgrade-required') {
    return { blocked: true, activeModelAfter: activeModel };
  }
  return { blocked: false, activeModelAfter: incomingModel };
}

describe('sidebar sendMessage — paywall guard (P0-F)', () => {
  const mockContext = {};

  beforeEach(() => {
    vi.mocked(resolveTier).mockResolvedValue('byok');
  });

  it('allows same-provider switch (claude→claude) on byok tier', async () => {
    const result = await simulateSendMessage('claude-opus-4-6', 'claude-sonnet-4.6', mockContext);
    expect(result.blocked).toBe(false);
    expect(result.activeModelAfter).toBe('claude-sonnet-4.6');
  });

  it('blocks cross-provider switch (claude→gpt) on free tier', async () => {
    vi.mocked(resolveTier).mockResolvedValue('byok');
    const result = await simulateSendMessage('claude-opus-4-6', 'gpt-5.5', mockContext);
    expect(result.blocked).toBe(true);
    expect(result.activeModelAfter).toBe('claude-opus-4-6');
  });

  it('blocks cross-provider switch (gpt→gemini) on hobby tier', async () => {
    vi.mocked(resolveTier).mockResolvedValue('hobby');
    const result = await simulateSendMessage('gpt-5.5', 'gemini-3.1-pro-preview', mockContext);
    expect(result.blocked).toBe(true);
    expect(result.activeModelAfter).toBe('gpt-5.5');
  });

  it('blocks cross-provider switch (claude→grok) on pro tier', async () => {
    vi.mocked(resolveTier).mockResolvedValue('pro');
    const result = await simulateSendMessage('claude-opus-4-6', 'grok-4', mockContext);
    expect(result.blocked).toBe(true);
    expect(result.activeModelAfter).toBe('claude-opus-4-6');
  });

  it('allows cross-provider switch (claude→gpt) on pro_plus tier', async () => {
    vi.mocked(resolveTier).mockResolvedValue('pro_plus');
    const result = await simulateSendMessage('claude-opus-4-6', 'gpt-5.5', mockContext);
    expect(result.blocked).toBe(false);
    expect(result.activeModelAfter).toBe('gpt-5.5');
  });

  it('allows cross-provider switch (gpt→gemini) on max tier', async () => {
    vi.mocked(resolveTier).mockResolvedValue('max');
    const result = await simulateSendMessage('gpt-5.5', 'gemini-3.1-pro-preview', mockContext);
    expect(result.blocked).toBe(false);
    expect(result.activeModelAfter).toBe('gemini-3.1-pro-preview');
  });

  it('allows auto-mode switch on any tier (never gated)', async () => {
    vi.mocked(resolveTier).mockResolvedValue('byok');
    const result = await simulateSendMessage('claude-opus-4-6', 'auto-balanced', mockContext);
    expect(result.blocked).toBe(false);
    expect(result.activeModelAfter).toBe('auto-balanced');
  });

  it('does not advance activeModel on blocked switch', async () => {
    vi.mocked(resolveTier).mockResolvedValue('byok');
    let activeModel = 'claude-opus-4-6';

    const r1 = await simulateSendMessage(activeModel, 'gpt-5.5', mockContext);
    expect(r1.blocked).toBe(true);
    // activeModel must not advance
    activeModel = r1.activeModelAfter;
    expect(activeModel).toBe('claude-opus-4-6');

    // Second attempt on same provider should still work
    const r2 = await simulateSendMessage(activeModel, 'claude-sonnet-4.6', mockContext);
    expect(r2.blocked).toBe(false);
    expect(r2.activeModelAfter).toBe('claude-sonnet-4.6');
  });
});

// ─── Workspace-spoofing regression (real resolveTier path) ───────────────────
//
// These tests do NOT mock resolveTier. They control vscode.workspace.getConfiguration
// to simulate what happens when an untrusted workspace sets "agiWorkforce.tier"
// via .vscode/settings.json, verifying that inspect().globalValue is what the
// resolver reads — not the merged effective value that workspaceValue would win.

describe('resolveTier — workspace tier spoofing regression (P0-F hardening)', () => {
  // Build a fake ExtensionContext with a controllable globalState tier cache.
  function makeContext(cachedTier?: string): import('vscode').ExtensionContext {
    return {
      globalState: {
        get: (key: string) => (key === 'tierStatus.cachedTier' ? cachedTier : undefined),
        update: vi.fn(),
        keys: () => [],
        setKeysForSync: vi.fn(),
      },
    } as unknown as import('vscode').ExtensionContext;
  }

  // Helper: configure what inspect('tier') returns for a given scope combination.
  function stubTierInspect({
    globalValue,
    workspaceValue,
  }: {
    globalValue?: string;
    workspaceValue?: string;
  }): void {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(),
      inspect: vi.fn((key: string) => {
        if (key === 'tier') return { globalValue, workspaceValue };
        return undefined;
      }),
      has: vi.fn().mockReturnValue(false),
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  }

  beforeEach(() => {
    vi.mocked(resolveTier).mockRestore?.();
  });

  it('workspace "max" does not escalate when globalValue is byok (the bypass case)', async () => {
    // Simulate: untrusted workspace sets tier=max; global is the default (undefined → byok)
    stubTierInspect({ globalValue: undefined, workspaceValue: 'max' });
    const ctx = makeContext(undefined);

    // Import the REAL resolveTier (not the mock) for this test.
    const { resolveTier: realResolveTier } = await vi.importActual<
      typeof import('../services/tierResolver')
    >('../services/tierResolver');

    // preferBridge=false so we skip the network call
    const tier = await realResolveTier(ctx, false);
    // Should fall through to the safe byok default — NOT 'max'
    expect(tier).toBe('byok');
  });

  it('global "pro_plus" is respected (legitimate user setting)', async () => {
    stubTierInspect({ globalValue: 'pro_plus', workspaceValue: undefined });
    const ctx = makeContext(undefined);

    const { resolveTier: realResolveTier } = await vi.importActual<
      typeof import('../services/tierResolver')
    >('../services/tierResolver');

    const tier = await realResolveTier(ctx, false);
    expect(tier).toBe('pro_plus');
  });

  it('workspace "pro_plus" when globalValue is byok still resolves to byok', async () => {
    stubTierInspect({ globalValue: undefined, workspaceValue: 'pro_plus' });
    const ctx = makeContext(undefined);

    const { resolveTier: realResolveTier } = await vi.importActual<
      typeof import('../services/tierResolver')
    >('../services/tierResolver');

    const tier = await realResolveTier(ctx, false);
    expect(tier).toBe('byok');
  });

  it('cached globalState tier is used when no global setting is present', async () => {
    stubTierInspect({ globalValue: undefined, workspaceValue: undefined });
    const ctx = makeContext('hobby');

    const { resolveTier: realResolveTier } = await vi.importActual<
      typeof import('../services/tierResolver')
    >('../services/tierResolver');

    const tier = await realResolveTier(ctx, false);
    expect(tier).toBe('hobby');
  });

  it('cross-provider switch is still blocked when workspace spoofs tier=max but global is byok', async () => {
    stubTierInspect({ globalValue: undefined, workspaceValue: 'max' });
    const ctx = makeContext(undefined);

    const { resolveTier: realResolveTier } = await vi.importActual<
      typeof import('../services/tierResolver')
    >('../services/tierResolver');

    const tier = await realResolveTier(ctx, false);
    const guardResult = guardProviderSwitch('claude-opus-4-6', 'gpt-5.5', tier);
    expect(guardResult).toBe('upgrade-required');
  });
});
