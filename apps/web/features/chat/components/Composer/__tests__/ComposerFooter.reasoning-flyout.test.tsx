/**
 * ComposerFooter · reasoning/effort flyout (reasoning-effort-capability wave)
 *
 * Verifies the picker's effort flyout against the REAL component + REAL
 * models.json `reasoning` blocks (jsdom render — the compiled-component
 * verification path allowed when the signed-in dev handshake is not exercised).
 * Mirrors the Playwright verification points (a)-(e):
 *   (a) OpenAI reasoning model (gpt-5.5) shows none/low/medium/high/xhigh —
 *       NOT max, NOT minimal.
 *   (b) non-reasoning model (gpt-4.1-nano) shows NO effort control.
 *   (c) Anthropic Opus 4.8 shows low/medium/high/xhigh/max.
 *   (d) Haiku 4.5 now supports thinking (effort control present).
 *   (e) gpt-5.6-sol appears "Coming soon", aria-disabled, tabIndex -1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

// Mutable selected model, controlled per-test.
const sel = vi.hoisted(() => ({ id: 'gpt-5.5' }));

const MODELS = vi.hoisted(() => [
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'Frontier',
  },
  {
    id: 'gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'Cheap',
  },
  {
    id: 'claude-opus-4.8',
    name: 'Claude 4.8 Opus',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Frontier',
  },
  {
    id: 'claude-haiku-4.5',
    name: 'Claude 4.5 Haiku',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Fast',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'Google',
    providerKey: 'google',
    description: 'Fast',
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'Frontier',
    availability: 'coming_soon' as const,
    unavailableReason: 'GA announced 2026-07-09; 404 on our key.',
  },
]);

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModelId: sel.id,
      setSelectedModelId: (id: string) => {
        sel.id = id;
      },
      getSelectedModel: () => MODELS.find((m) => m.id === sel.id) ?? MODELS[0],
    }),
  AVAILABLE_MODELS: MODELS,
}));

vi.mock('@/stores/unified/auth', () => ({
  useBillingStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ subscription: { tier: 'max' }, dailyUsage_cents: 0, dailyLimit_cents: 0 }),
}));

// REAL @/constants/llm reasoning data — only tier gating is stubbed so every live
// model is selectable at max tier. getModelReasoning/getModelMetadata are the
// genuine catalog readers, so the flyout is driven by real models.json data.
vi.mock('@/constants/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/constants/llm')>();
  return {
    ...actual,
    getAllowedAutoModesForTier: () => ['auto-economy', 'auto-balanced', 'auto-premium'],
    getBestAutoModeForTier: () => 'gpt-5.5',
    isModelAllowedForTier: () => true,
  };
});

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: [],
  FREE_TRIAL_MODEL: 'gemini-3.1-flash-lite',
}));

// Stateful thinking store: enabled so effort chips render for switch-gated models.
const thinking = vi.hoisted(() => ({ enabled: true, effort: 'medium' }));
vi.mock('@shared/stores/thinking-store', () => ({
  useThinkingStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      enabled: thinking.enabled,
      effort: thinking.effort,
      setEnabled: (v: boolean) => {
        thinking.enabled = v;
      },
      setEffort: (v: string) => {
        thinking.effort = v;
        thinking.enabled = true;
      },
    }),
}));

vi.mock('@/features/chat/components/Budget/BudgetTrackerDisplay', () => ({
  BudgetTrackerDisplay: () => <div />,
}));
vi.mock('../StyleSelector', () => ({ StyleSelector: () => <div /> }));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeConversationId: null, messages: [] }),
}));
vi.mock('@agiworkforce/services', () => ({ assessModelSwitchCache: () => ({ warn: false }) }));

vi.mock('@agiworkforce/ui', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
  Switch: (props: { checked?: boolean }) => (
    <div data-testid="switch" data-checked={props.checked ? 'true' : 'false'} />
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('@shared/components/ProviderMark', () => ({
  ProviderMark: () => null,
  hasProviderMark: () => false,
}));
vi.mock('@/components/agi/AgiMark', () => ({ AgiMark: () => null }));
vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return { ...actual, persist: (config: (set: unknown) => unknown) => config };
});

import { ComposerFooter } from '../ComposerFooter';

/** Text labels of the effort chips currently rendered in the flyout group. */
function effortChipLabels(): string[] {
  const group = screen.queryByRole('group', { name: /reasoning effort level/i });
  if (!group) return [];
  return within(group)
    .getAllByRole('button')
    .map((b) => b.querySelector('span span')?.textContent?.trim() ?? '')
    .filter(Boolean);
}

describe('ComposerFooter · reasoning/effort flyout (real component + real catalog)', () => {
  beforeEach(() => {
    thinking.enabled = true;
    thinking.effort = 'medium';
  });

  it('(a) OpenAI gpt-5.5 shows none/low/medium/high/xhigh — NOT max, NOT minimal', () => {
    sel.id = 'gpt-5.5';
    render(<ComposerFooter />);
    const chips = effortChipLabels();
    expect(chips).toEqual(['None', 'Low', 'Medium', 'High', 'xHigh']);
    expect(chips).not.toContain('Max');
    expect(chips).not.toContain('Minimal');
  });

  it('(b) non-reasoning gpt-4.1-nano shows NO effort control', () => {
    sel.id = 'gpt-4.1-nano';
    render(<ComposerFooter />);
    expect(effortChipLabels()).toEqual([]);
    expect(screen.queryByRole('group', { name: /reasoning effort/i })).not.toBeInTheDocument();
  });

  it('(c) Anthropic Opus 4.8 shows low/medium/high/xhigh/max', () => {
    sel.id = 'claude-opus-4.8';
    render(<ComposerFooter />);
    expect(effortChipLabels()).toEqual(['Low', 'Medium', 'High', 'xHigh', 'Max']);
  });

  it('(a2) Gemini 3.5 Flash folds `minimal` into `low` — no duplicate store-effort chip', () => {
    sel.id = 'gemini-3.5-flash';
    thinking.effort = 'low';
    render(<ComposerFooter />);
    const chips = effortChipLabels();
    // supportedEfforts is [minimal,low,medium,high]; `minimal` (→ store 'low') is
    // dropped so it can't double-highlight with Low.
    expect(chips).toEqual(['Low', 'Medium', 'High']);
    expect(chips).not.toContain('Minimal');
  });

  it('(d) Haiku 4.5 now supports thinking (effort control is present)', () => {
    sel.id = 'claude-haiku-4.5';
    render(<ComposerFooter />);
    // thinking_budget control → an on/off switch + budget chips (thinking supported).
    expect(screen.getAllByTestId('switch').length).toBeGreaterThan(0);
    expect(effortChipLabels().length).toBeGreaterThan(0);
  });

  it('(e) gpt-5.6-sol appears as a "Coming soon", non-selectable, non-focusable row', () => {
    sel.id = 'gpt-5.5';
    render(<ComposerFooter />);
    // coming_soon rows live in the "More models" group — expand it.
    fireEvent.click(screen.getByRole('button', { name: /more models/i }));
    const row = screen.getByRole('button', { name: /gpt-5\.6 sol.*not yet available/i });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
