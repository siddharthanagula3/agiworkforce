/**
 * ComposerFooter · reasoning/effort flyout (reasoning-effort-capability wave)
 *
 * Verifies the picker's effort flyout against the REAL component + REAL
 * models.json `reasoning` blocks (jsdom render — the compiled-component
 * verification path allowed when the signed-in dev handshake is not exercised).
 * Mirrors the current-roster verification points:
 *   (a) GPT-5.6 Sol shows its exact none/low/medium/high/xhigh/max ladder.
 *   (b) non-reasoning model (gemini-3.1-flash-lite) shows NO effort control.
 *   (c) Anthropic Opus 4.8 shows low/medium/high/xhigh/max.
 *   (d) Haiku 4.5 now supports thinking (effort control present).
 *   (e) Fable 5 reasoning is mandatory and cannot be switched off.
 *   (f) GPT-5.6 Sol is live/selectable, while a synthetic future preview is disabled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

// Mutable selected model, controlled per-test.
const sel = vi.hoisted(() => ({ id: 'gpt-5.6-sol' }));

const MODELS = vi.hoisted(() => [
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'Frontier',
  },
  {
    id: 'claude-fable-5',
    name: 'Claude Fable 5',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Adaptive reasoning',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'Google',
    providerKey: 'google',
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
    id: 'future-preview-model',
    name: 'Future Preview Model',
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
vi.mock('@shared/config/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/config/llm')>();
  return {
    ...actual,
    getAllowedAutoModesForTier: () => ['auto-economy', 'auto-balanced', 'auto-premium'],
    getBestAutoModeForTier: () => 'gpt-5.6-sol',
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
vi.mock('@agiworkforce/routing', () => ({ assessModelSwitchCache: () => ({ warn: false }) }));

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
vi.mock('@shared/components/agi/AgiMark', () => ({ AgiMark: () => null }));
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

  it('(a) GPT-5.6 Sol shows none/low/medium/high/xhigh/max', () => {
    sel.id = 'gpt-5.6-sol';
    render(<ComposerFooter />);
    const chips = effortChipLabels();
    expect(chips).toEqual(['None', 'Low', 'Medium', 'High', 'xHigh', 'Max']);
    expect(chips).not.toContain('Minimal');
  });

  it('(b) non-reasoning gemini-3.1-flash-lite shows NO effort control', () => {
    sel.id = 'gemini-3.1-flash-lite';
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

  it('(e) Fable 5 shows mandatory reasoning without an off switch', () => {
    sel.id = 'claude-fable-5';
    thinking.enabled = false;
    render(<ComposerFooter />);

    expect(screen.getByText('Always on for this model')).toBeInTheDocument();
    expect(screen.getByText('Always on')).toBeInTheDocument();
    expect(screen.queryByLabelText('Toggle extended thinking')).not.toBeInTheDocument();
  });

  it('(f) GPT-5.6 Sol is live, selected, and has no stale availability badge', () => {
    sel.id = 'gpt-5.6-sol';
    render(<ComposerFooter />);

    const row = screen.getByRole('button', { name: 'GPT-5.6 Sol' });
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('keeps a synthetic future preview non-selectable and non-focusable', () => {
    sel.id = 'gpt-5.6-sol';
    render(<ComposerFooter />);
    // coming_soon rows live in the "More models" group — expand it.
    fireEvent.click(screen.getByRole('button', { name: /more models/i }));
    const row = screen.getByRole('button', { name: /future preview model.*not yet available/i });
    expect(row).toBeDisabled();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
