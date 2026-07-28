/**
 * ComposerFooter · reasoning/effort flyout (reasoning-effort-capability wave)
 *
 * Verifies the picker's effort flyout against the REAL component + REAL
 * models.json `reasoning` blocks (jsdom render — the compiled-component
 * verification path allowed when the signed-in dev handshake is not exercised).
 * Mirrors the current-roster verification points:
 *   (a) GPT-5.6 Sol shows its exact none/low/medium/high/xhigh/max ladder.
 *   (b) non-reasoning model (Sonar) shows NO effort control.
 *   (c) Anthropic Opus 5 shows low/medium/high/xhigh/max.
 *   (d) removed: Haiku 4.5 was the only catalog model without an effort
 *       ladder, and it was retired 2026-07-27. Every remaining model has
 *       one, so 'no reasoning control' has no model to demonstrate it.
 *   (e) Fable 5 reasoning is mandatory and cannot be switched off.
 *   (f) GPT-5.6 Sol is live/selectable, while a synthetic future preview is disabled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'Google',
    providerKey: 'google',
    description: 'Cheap',
  },
  {
    id: 'sonar',
    name: 'Sonar',
    provider: 'Perplexity',
    providerKey: 'perplexity',
    description: 'Search',
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Frontier',
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude 4.5 Haiku',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Fast',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
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

vi.mock('@shared/stores/web-auth-store', () => ({
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
  FREE_TRIAL_MODEL: 'gemini-3.5-flash-lite',
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
vi.mock('@shared/stores/web-chat-store', () => ({
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
  Slider: (props: {
    value?: number[];
    min?: number;
    max?: number;
    step?: number;
    valueLabel?: string;
    thumbAriaLabel?: string;
    onValueChange?: (value: number[]) => void;
  }) => (
    <input
      type="range"
      value={props.value?.[0] ?? 0}
      min={props.min}
      max={props.max}
      step={props.step}
      aria-label={props.thumbAriaLabel}
      aria-valuetext={props.valueLabel}
      onChange={(event) => props.onValueChange?.([Number(event.currentTarget.value)])}
    />
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

describe('ComposerFooter · reasoning/effort flyout (real component + real catalog)', () => {
  beforeEach(() => {
    thinking.enabled = true;
    thinking.effort = 'medium';
  });

  it('(a) GPT-5.6 Sol exposes its six exact levels through one compact slider', () => {
    sel.id = 'gpt-5.6-sol';
    render(<ComposerFooter />);
    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '5');
    expect(slider).toHaveAttribute('aria-valuetext', 'Medium');
    expect(screen.getByRole('button', { name: 'Change model' })).toHaveTextContent('Medium');
    expect(screen.queryByRole('button', { name: 'Reasoning effort High' })).not.toBeInTheDocument();
  });

  it('(b) non-reasoning Sonar shows NO effort control', () => {
    sel.id = 'sonar';
    render(<ComposerFooter />);
    expect(screen.queryByRole('group', { name: /reasoning effort/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /reasoning effort/i })).not.toBeInTheDocument();
  });

  it('Gemini 3.5 Flash-Lite exposes its catalog-backed minimal/low/medium/high slider', () => {
    sel.id = 'gemini-3.5-flash-lite';
    thinking.effort = 'low';
    render(<ComposerFooter />);

    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('aria-valuetext', 'Low');
    expect(screen.getByText('Always on for this model')).toBeInTheDocument();
  });

  it('(c) Anthropic Opus 5 exposes five catalog levels through the slider', () => {
    sel.id = 'claude-opus-5';
    render(<ComposerFooter />);
    expect(screen.getByRole('slider', { name: 'Reasoning effort' })).toHaveAttribute('max', '4');
  });

  it('(a2) Gemini 3.6 Flash exposes its exact minimal/low/medium/high slider', () => {
    sel.id = 'gemini-3.6-flash';
    thinking.effort = 'minimal';
    render(<ComposerFooter />);
    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('aria-valuetext', 'Minimal');
  });

  it('places the effort slider before the model list and updates by discrete catalog index', () => {
    sel.id = 'gemini-3.6-flash';
    thinking.effort = 'medium';
    render(<ComposerFooter />);

    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    const available = screen.getByText('Available');
    expect(
      slider.compareDocumentPosition(available) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.change(slider, { target: { value: '3' } });
    expect(thinking.effort).toBe('high');
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
