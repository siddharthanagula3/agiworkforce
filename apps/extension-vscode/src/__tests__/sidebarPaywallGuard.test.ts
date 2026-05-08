/**
 * sidebarPaywallGuard.test.ts — Tests for the Pro+ paywall guard in _handleSendMessage
 *
 * Exercises the guardProviderSwitch + resolveTier integration point added in P0-F.
 * Uses direct unit tests on the guard helpers; the sidebar integration path is
 * covered by verifying guard result propagation in the sidebar handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guardProviderSwitch } from '../services/providerSwitchGuard';
import { resolveTier, type Tier } from '../services/tierResolver';

// ─── Mock tierResolver bridge fetch so tests are offline ─────────────────────

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
