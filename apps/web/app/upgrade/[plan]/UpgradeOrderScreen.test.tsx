import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const queryMocks = vi.hoisted(() => ({ invalidateQueries: vi.fn(async () => {}) }));
const storeMocks = vi.hoisted(() => ({ refreshUser: vi.fn(async () => {}) }));
const panelMocks = vi.hoisted(() => ({ onUpgraded: null as null | (() => void) }));

vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return { ...actual, useQueryClient: () => queryMocks };
});
vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (s: unknown) => unknown) => selector(storeMocks),
}));
vi.mock('@features/billing/components/UpgradeOrderPanel', () => ({
  UpgradeOrderPanel: ({ plan, onUpgraded }: { plan: string; onUpgraded: () => void }) => {
    panelMocks.onUpgraded = onUpgraded;
    return <div data-testid="panel" data-plan={plan} />;
  },
}));

import { UpgradeOrderScreen } from './UpgradeOrderScreen';

describe('UpgradeOrderScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    panelMocks.onUpgraded = null;
  });

  it('re-reads the plan everywhere once the upgrade lands', async () => {
    // Without this the screen would congratulate the user while the sidebar and
    // pricing cards still render the plan they just paid to leave.
    render(<UpgradeOrderScreen plan="max" billingInterval="monthly" />);
    panelMocks.onUpgraded?.();

    await waitFor(() => expect(queryMocks.invalidateQueries).toHaveBeenCalled());
    expect(storeMocks.refreshUser).toHaveBeenCalled();
    expect(await screen.findByText(/You.re on/i)).toBeVisible();
  });

  it('switches which capacity is being bought without leaving the screen', async () => {
    render(<UpgradeOrderScreen plan="max" billingInterval="monthly" />);
    expect(screen.getByTestId('panel')).toHaveAttribute('data-plan', 'max');

    fireEvent.click(screen.getByRole('button', { name: /Max 15x/i }));

    // The panel re-previews against the newly selected capacity, so the price
    // shown belongs to the plan the button will actually buy.
    await waitFor(() =>
      expect(screen.getByTestId('panel')).toHaveAttribute('data-plan', 'max_15x'),
    );
  });

  it('offers no capacity switch for a plan that has only one', () => {
    render(<UpgradeOrderScreen plan="basic" billingInterval="monthly" />);

    expect(screen.queryByRole('group', { name: 'Capacity' })).toBeNull();
  });
});
