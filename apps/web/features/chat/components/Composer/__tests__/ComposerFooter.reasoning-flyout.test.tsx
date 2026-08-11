/**
 * ComposerFooter · reasoning/effort flyout (reasoning-effort-capability wave)
 *
 * Verifies the real component against capability-shaped synthetic fixtures.
 * Catalog-contract tests separately prove that live entries satisfy the same
 * reasoning schema, while this UI test stays stable when a concrete model is
 * replaced in the one canonical registry owner.
 *   (a) Six-Level Fixture shows its exact none/low/medium/high/xhigh/max ladder.
 *   (b) non-reasoning model (Non-Reasoning Fixture) shows NO effort control.
 *   (c) Five-Level Fixture shows low/medium/high/xhigh/max.
 *   (d) a non-reasoning fixture exposes no synthetic effort ladder.
 *   (e) Always-On Fixture reasoning is mandatory and cannot be switched off.
 *   (f) Six-Level Fixture is live/selectable, while a synthetic future preview is disabled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mutable selected model, controlled per-test.
const sel = vi.hoisted(() => ({ id: 'fixture-six-level' }));

const MODELS = vi.hoisted(() => [
  {
    id: 'fixture-six-level',
    name: 'Six-Level Fixture',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'Frontier',
  },
  {
    id: 'fixture-always-on',
    name: 'Always-On Fixture',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Adaptive reasoning',
  },
  {
    id: 'fixture-four-level',
    name: 'Four-Level Fixture',
    provider: 'Google',
    providerKey: 'google',
    description: 'Cheap',
  },
  {
    id: 'fixture-no-reasoning',
    name: 'Non-Reasoning Fixture',
    provider: 'Perplexity',
    providerKey: 'perplexity',
    description: 'Search',
  },
  {
    id: 'fixture-five-level',
    name: 'Five-Level Fixture',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Frontier',
  },
  {
    id: 'fixture-standard',
    name: 'Standard Fixture',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Fast',
  },
  {
    id: 'fixture-four-level-secondary',
    name: 'Four-Level Secondary Fixture',
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

const REASONING_BY_MODEL = vi.hoisted(
  () =>
    ({
      'fixture-six-level': {
        capable: true,
        control: 'effort_levels',
        supportedEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'medium',
        canDisableThinking: true,
      },
      'fixture-always-on': {
        capable: true,
        control: 'always_on',
        supportedEfforts: ['low', 'medium', 'high'],
        defaultEffort: 'medium',
        canDisableThinking: false,
      },
      'fixture-four-level': {
        capable: true,
        control: 'always_on',
        supportedEfforts: ['minimal', 'low', 'medium', 'high'],
        defaultEffort: 'medium',
        canDisableThinking: false,
      },
      'fixture-no-reasoning': {
        capable: false,
        control: 'none',
        supportedEfforts: [],
        canDisableThinking: false,
      },
      'fixture-five-level': {
        capable: true,
        control: 'effort_levels',
        supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'medium',
        canDisableThinking: true,
      },
      'fixture-standard': {
        capable: true,
        control: 'effort_levels',
        supportedEfforts: ['low', 'medium', 'high'],
        defaultEffort: 'medium',
        canDisableThinking: true,
      },
      'fixture-four-level-secondary': {
        capable: true,
        control: 'always_on',
        supportedEfforts: ['minimal', 'low', 'medium', 'high'],
        defaultEffort: 'medium',
        canDisableThinking: false,
      },
    }) as Record<string, Record<string, unknown>>,
);

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

// Keep the component's real configuration module, replacing only the catalog
// lookup with capability fixtures and tier gates needed by this focused unit.
vi.mock('@shared/config/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/config/llm')>();
  return {
    ...actual,
    getModelReasoning: (modelId: string) =>
      REASONING_BY_MODEL[modelId] ?? {
        capable: false,
        control: 'none',
        supportedEfforts: [],
      },
    getAllowedAutoModesForTier: () => ['auto-economy', 'auto-balanced', 'auto-premium'],
    getBestAutoModeForTier: () => 'fixture-six-level',
    isModelAllowedForTier: () => true,
  };
});

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: [],
  FREE_TRIAL_MODEL: 'fixture-four-level',
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

describe('ComposerFooter · reasoning/effort flyout', () => {
  beforeEach(() => {
    thinking.enabled = true;
    thinking.effort = 'medium';
  });

  it('(a) Six-Level Fixture exposes its six exact levels through one compact slider', () => {
    sel.id = 'fixture-six-level';
    render(<ComposerFooter />);
    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '5');
    expect(slider).toHaveAttribute('aria-valuetext', 'Medium');
    expect(screen.getByRole('button', { name: 'Change model' })).toHaveTextContent('Medium');
    expect(screen.queryByRole('button', { name: 'Reasoning effort High' })).not.toBeInTheDocument();
  });

  it('(b) non-reasoning Non-Reasoning Fixture shows NO effort control', () => {
    sel.id = 'fixture-no-reasoning';
    render(<ComposerFooter />);
    expect(screen.queryByRole('group', { name: /reasoning effort/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /reasoning effort/i })).not.toBeInTheDocument();
  });

  it('Four-Level Fixture exposes its catalog-backed minimal/low/medium/high slider', () => {
    sel.id = 'fixture-four-level';
    thinking.effort = 'low';
    render(<ComposerFooter />);

    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('aria-valuetext', 'Low');
    expect(screen.getByText('Always on for this model')).toBeInTheDocument();
  });

  it('(c) Five-Level Fixture exposes five catalog levels through the slider', () => {
    sel.id = 'fixture-five-level';
    render(<ComposerFooter />);
    expect(screen.getByRole('slider', { name: 'Reasoning effort' })).toHaveAttribute('max', '4');
  });

  it('(a2) Four-Level Secondary Fixture exposes its exact minimal/low/medium/high slider', () => {
    sel.id = 'fixture-four-level-secondary';
    thinking.effort = 'minimal';
    render(<ComposerFooter />);
    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('aria-valuetext', 'Minimal');
  });

  it('places the effort slider before the model list and updates by discrete catalog index', () => {
    sel.id = 'fixture-four-level-secondary';
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

  it('(e) Always-On Fixture shows mandatory reasoning without an off switch', () => {
    sel.id = 'fixture-always-on';
    thinking.enabled = false;
    render(<ComposerFooter />);

    expect(screen.getByText('Always on for this model')).toBeInTheDocument();
    expect(screen.getByText('Always on')).toBeInTheDocument();
    expect(screen.queryByLabelText('Toggle extended thinking')).not.toBeInTheDocument();
  });

  it('(f) Six-Level Fixture is live, selected, and has no stale availability badge', () => {
    sel.id = 'fixture-six-level';
    render(<ComposerFooter />);

    const row = screen.getByRole('button', { name: 'Six-Level Fixture' });
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('keeps a synthetic future preview non-selectable and non-focusable', () => {
    sel.id = 'fixture-six-level';
    render(<ComposerFooter />);
    // coming_soon rows live in the "More models" group — expand it.
    fireEvent.click(screen.getByRole('button', { name: /more models/i }));
    const row = screen.getByRole('button', { name: /future preview model.*not yet available/i });
    expect(row).toBeDisabled();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
