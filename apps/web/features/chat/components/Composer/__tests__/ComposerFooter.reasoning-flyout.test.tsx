import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

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

const billing = vi.hoisted(() => ({ tier: 'max' }));
vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      subscription: { tier: billing.tier },
      dailyUsage_cents: 0,
      dailyLimit_cents: 0,
    }),
}));

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

vi.mock('../StyleSelector', () => ({ StyleSelector: () => <div /> }));
const CATALOGUE_ENTRIES = vi.hoisted(() => [
  {
    id: 'future-preview-model',
    displayName: 'Future Preview Model',
    provider: 'openai',
    family: null,
    isRouter: false,
    releasedOn: null,
    stage: null,
    openWeight: false,
    contextTokens: null,
    maxOutputTokens: null,
    inputPerMillion: 0,
    outputPerMillion: 0,
    priceBand: null,
    capabilities: {},
    admitted: true,
    minimumPlanLabel: null,
    availability: 'coming_soon',
    requiresEnvironment: null,
  },
]);

vi.mock('@features/chat/lib/use-model-catalogue', () => ({
  useModelCatalogue: () => ({
    status: 'ready',
    entries: CATALOGUE_ENTRIES,
    providers: [{ key: 'openai', admittedCount: 1, totalCount: 1 }],
    count: CATALOGUE_ENTRIES.length,
    planLabel: 'Max 15x',
  }),
}));

vi.mock('@features/chat/lib/use-model-favourites', () => ({
  useModelFavourites: () => ({ favouriteModelIds: [], toggleFavourite: vi.fn() }),
}));

vi.mock('@shared/stores/web-chat-store', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeConversationId: null, conversations: [], messages: [] }),
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/routing')>()),
  assessModelSwitchCache: () => ({ warn: false, resetsCache: false }),
}));

vi.mock('@agiworkforce/ui', () => ({
  useMenuKeyboard: () => undefined,
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
    onValueCommit?: (value: number[]) => void;
  }) => (
    <input
      type="range"
      value={props.value?.[0] ?? 0}
      min={props.min}
      max={props.max}
      step={props.step}
      aria-label={props.thumbAriaLabel}
      aria-valuetext={props.valueLabel}
      onChange={(event) => {
        const next = [Number(event.currentTarget.value)];
        props.onValueChange?.(next);
        props.onValueCommit?.(next);
      }}
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

const effortTrigger = () => screen.getByRole('button', { name: /^Reasoning effort/ });
const effortSlider = () => screen.getByRole('slider', { name: 'Reasoning effort' });
const effortLevel = () => effortSlider().getAttribute('aria-valuetext');
const moveEffort = (index: number) =>
  fireEvent.change(effortSlider(), { target: { value: String(index) } });

describe('ComposerFooter · reasoning/effort flyout', () => {
  beforeEach(() => {
    thinking.enabled = true;
    thinking.effort = 'medium';
    billing.tier = 'max';
  });

  it('(a) Six-Level Fixture exposes its six exact levels on the effort slider', () => {
    sel.id = 'fixture-six-level';
    render(<ComposerFooter />);
    expect(effortTrigger()).toHaveTextContent('Medium');
    expect(effortSlider()).toHaveAttribute('min', '0');
    expect(effortSlider()).toHaveAttribute('max', '5');
    expect(effortLevel()).toBe('Medium');
    expect(screen.getByRole('button', { name: 'Change model' })).not.toHaveTextContent('Medium');
  });

  it('(b) non-reasoning Non-Reasoning Fixture shows NO effort control', () => {
    sel.id = 'fixture-no-reasoning';
    render(<ComposerFooter />);
    expect(screen.queryByRole('button', { name: /^Reasoning effort/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('Four-Level Fixture exposes its catalog-backed minimal/low/medium/high slider', () => {
    sel.id = 'fixture-four-level';
    thinking.effort = 'low';
    render(<ComposerFooter />);

    expect(screen.getByText('Always on for this model')).toBeInTheDocument();
    expect(effortSlider()).toHaveAttribute('max', '3');
    expect(effortLevel()).toBe('Low');
  });

  it('(c) Five-Level Fixture exposes five catalog levels through the slider', () => {
    sel.id = 'fixture-five-level';
    render(<ComposerFooter />);
    expect(effortSlider()).toHaveAttribute('max', '4');
  });

  it('(c2) Five-Level Fixture hides the slider while extended thinking is off', () => {
    sel.id = 'fixture-five-level';
    thinking.enabled = false;
    render(<ComposerFooter />);
    expect(screen.getByTestId('switch')).toHaveAttribute('data-checked', 'false');
    expect(effortTrigger()).toHaveTextContent('Off');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('(a2) Four-Level Secondary Fixture exposes its exact minimal/low/medium/high slider', () => {
    sel.id = 'fixture-four-level-secondary';
    thinking.effort = 'minimal';
    render(<ComposerFooter />);
    expect(effortSlider()).toHaveAttribute('max', '3');
    expect(effortLevel()).toBe('Minimal');
    moveEffort(3);
    expect(thinking.effort).toBe('high');
  });

  it('keeps effort as its own control beside the model trigger, not inside the picker', () => {
    sel.id = 'fixture-four-level-secondary';
    thinking.effort = 'medium';
    render(<ComposerFooter />);

    const modelTrigger = screen.getByRole('button', { name: 'Change model' });
    expect(
      modelTrigger.compareDocumentPosition(effortTrigger()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Effort$/ })).not.toBeInTheDocument();

    const panel = effortSlider().closest('[data-testid="popover-content"]') as HTMLElement;
    expect(within(panel).getByText('Always on for this model')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /all models/i })).not.toBeInTheDocument();
  });

  it('(e) Always-On Fixture shows mandatory reasoning without an off switch', () => {
    sel.id = 'fixture-always-on';
    thinking.enabled = false;
    render(<ComposerFooter />);

    expect(screen.getByText('Always on for this model')).toBeInTheDocument();
    expect(effortTrigger()).toBeInTheDocument();
    expect(screen.queryByTestId('switch')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Toggle extended thinking')).not.toBeInTheDocument();
  });

  it('(f) Six-Level Fixture is live, selected, and has no stale availability badge', () => {
    sel.id = 'fixture-six-level';
    render(<ComposerFooter />);

    const row = screen.getByRole('button', { name: 'Six-Level Fixture' });
    expect(row).not.toBeDisabled();
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(within(row).queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('runs the slider across the gated levels and locks them for an unentitled tier', () => {
    sel.id = 'fixture-six-level';
    billing.tier = 'free';
    const onUpgradeRequest = vi.fn();
    render(<ComposerFooter onUpgradeRequest={onUpgradeRequest} />);

    expect(effortSlider()).toHaveAttribute('max', '5');
    expect(effortLevel()).toBe('Medium');
    moveEffort(4);
    expect(thinking.effort).toBe('medium');
    expect(onUpgradeRequest).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('High, xHigh, Max effort levels are not included in your plan.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(onUpgradeRequest).toHaveBeenCalledTimes(2);
  });

  it('does not present a persisted gated effort as active for an unentitled tier', () => {
    sel.id = 'fixture-six-level';
    billing.tier = 'free';
    thinking.effort = 'max';
    render(<ComposerFooter />);

    expect(effortTrigger()).toHaveTextContent('Medium');
    expect(effortLevel()).toBe('Medium');
  });

  it('keeps a synthetic future preview non-selectable and non-focusable', () => {
    sel.id = 'fixture-six-level';
    render(<ComposerFooter />);
    fireEvent.click(screen.getByRole('button', { name: /all models/i }));
    const row = screen.getByRole('option', {
      name: /future preview model.*coming soon/i,
    });
    expect(row).toBeDisabled();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
