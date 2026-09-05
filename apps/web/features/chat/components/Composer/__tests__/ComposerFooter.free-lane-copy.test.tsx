import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FREE_LANE_UI_MODES, FREE_LANE_UI_STORAGE_KEY } from '@features/chat/lib/free-lane-ui-gate';

const ENV_KEY = 'NEXT_PUBLIC_FREE_LANE_UI';
const LOCKED_MODEL_NAME = 'Economy Auto';
const FREE_LANE_COPY = 'Auto (free) · community models, capacity varies';
const TRIAL_COPY = `${LOCKED_MODEL_NAME} is selected for the free web trial`;

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (
    selector: (s: {
      subscription: { tier: string } | null;
      initialized: boolean;
      isLoading: boolean;
      error: string | null;
      dailyUsage_cents: number;
      dailyLimit_cents: number;
    }) => unknown,
  ) =>
    selector({
      subscription: { tier: 'free' },
      initialized: true,
      isLoading: false,
      error: null,
      dailyUsage_cents: 0,
      dailyLimit_cents: 0,
    }),
}));

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (
    selector: (s: {
      selectedModelId: string;
      setSelectedModelId: () => void;
      getSelectedModel: () => unknown;
    }) => unknown,
  ) =>
    selector({
      selectedModelId: 'fixture-economy-auto',
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => ({
        id: 'fixture-economy-auto',
        name: 'Economy Auto',
        provider: 'AGI',
        providerKey: 'managed_cloud',
        description: 'Cheapest routed mode',
      }),
    }),
  AVAILABLE_MODELS: [
    {
      id: 'fixture-economy-auto',
      name: 'Economy Auto',
      provider: 'AGI',
      providerKey: 'managed_cloud',
      description: 'Cheapest routed mode',
    },
  ],
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal()),
  getAllowedAutoModesForTier: () => ['fixture-economy-auto'],
  getBestAutoModeForTier: () => 'fixture-economy-auto',
  getModelMetadata: () => null,
  getModelReasoning: () => ({ capable: false, control: 'none' }),
  isModelAllowedForTier: () => true,
  splitEffortsByEntitlement: () => ({ allowed: [], gated: [] }),
  normalizeModelId: (id: string) => id,
  FREE_TRIAL_MODELS: [],
}));

vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODELS: [],
  FREE_TRIAL_MODEL: 'fixture-economy-auto',
}));

vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

vi.mock('@shared/stores/thinking-store', () => ({
  useThinkingStore: (selector: (s: { enabled: boolean; effort: string }) => unknown) =>
    selector({ enabled: false, effort: 'medium' }),
}));

vi.mock('@agiworkforce/ui', () => ({
  useMenuKeyboard: () => undefined,
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
  Slider: () => <div data-testid="slider" />,
  Switch: () => <div data-testid="switch" />,
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

vi.mock('@shared/components/agi/AgiMark', () => ({
  AgiMark: () => null,
}));

import { ComposerFooter } from '../ComposerFooter';

function lockedSlot(): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`${LOCKED_MODEL_NAME}|Auto \\(free\\)`) });
}

afterEach(() => {
  delete process.env[ENV_KEY];
  window.localStorage.clear();
});

describe('ComposerFooter · locked model slot copy', () => {
  it('names the model the free web trial actually pins when the lane is dark', () => {
    render(<ComposerFooter lockModelSelector />);

    const slot = lockedSlot();
    expect(slot).toHaveTextContent(LOCKED_MODEL_NAME);
    expect(slot).toHaveAttribute('aria-label', TRIAL_COPY);
  });

  it('describes the community lane once the free-lane copy is switched on', () => {
    process.env[ENV_KEY] = FREE_LANE_UI_MODES.on;

    render(<ComposerFooter lockModelSelector />);

    const slot = lockedSlot();
    expect(slot).toHaveTextContent(FREE_LANE_COPY);
    expect(slot).toHaveAttribute('aria-label', FREE_LANE_COPY);
  });

  it('takes the stored override, so the lane copy can be previewed per browser', () => {
    window.localStorage.setItem(FREE_LANE_UI_STORAGE_KEY, FREE_LANE_UI_MODES.on);

    render(<ComposerFooter lockModelSelector />);

    expect(lockedSlot()).toHaveTextContent(FREE_LANE_COPY);
  });

  /**
   * The label used to claim "Auto Economy" whatever the catalog resolved the
   * free tier to, so the two arms are asserted against what each one renders.
   */
  it('keeps the accessible name and the visible label saying the same thing', () => {
    for (const mode of [FREE_LANE_UI_MODES.off, FREE_LANE_UI_MODES.on]) {
      process.env[ENV_KEY] = mode;
      const { unmount } = render(<ComposerFooter lockModelSelector />);

      const slot = lockedSlot();
      expect(slot.getAttribute('aria-label')).toContain(slot.textContent);

      unmount();
    }
  });
});
