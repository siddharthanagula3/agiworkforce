import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../components/OperatorCostsPanel', () => ({ default: () => <div /> }));
vi.mock('../components/RoutingHealthPanel', () => ({ default: () => <div /> }));
vi.mock('../components/RouteEconomicsPanel', () => ({ default: () => <div /> }));
vi.mock('../components/ContentTakedownPanel', () => ({
  default: () => <div data-testid="content-takedown-panel" />,
}));
vi.mock('../components/PrivacyRequestsPanel', () => ({
  default: () => <div data-testid="privacy-requests-panel" />,
}));
vi.mock('@/features/support/components/SupportHandoffQueuePanel', () => ({
  SupportHandoffQueuePanel: () => <div data-testid="support-handoff-panel" />,
}));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: () => ({}) }));

import { OperatorDashboardPage } from './OperatorDashboardPage';

function setHash(hash: string) {
  window.history.replaceState(null, '', `/operator${hash}`);
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  setHash('');
});

/**
 * The admin console lists content takedown and the privacy queues among its
 * controls and links straight at them. Before the tab was addressable, both
 * links landed on the overview tab and the reviewer had to find the control
 * themselves, which is what made the report queue's pointer read as broken.
 */
describe('operator dashboard tab addressing', () => {
  it('opens the content takedown tab when the link names it', async () => {
    setHash('#content');
    render(<OperatorDashboardPage />);

    expect(await screen.findByTestId('content-takedown-panel')).toBeTruthy();
  });

  it('opens the live support handoff tab when the link names it', async () => {
    setHash('#support');

    render(<OperatorDashboardPage />);

    expect(await screen.findByTestId('support-handoff-panel')).toBeTruthy();
  });

  it('opens the privacy queue tab when the link names it', async () => {
    setHash('#privacy');
    render(<OperatorDashboardPage />);

    expect(await screen.findByTestId('privacy-requests-panel')).toBeTruthy();
  });

  it('falls back to the overview for an unknown hash instead of a blank view', async () => {
    setHash('#not-a-tab');
    render(<OperatorDashboardPage />);

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'overview' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });

  it('records the tab in the url so the view can be linked and reloaded', async () => {
    render(<OperatorDashboardPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'privacy' }));

    await waitFor(() => expect(window.location.hash).toBe('#privacy'));
    expect(screen.getByTestId('privacy-requests-panel')).toBeTruthy();
  });

  it('follows a hash change without a reload, which is what an in-page link does', async () => {
    render(<OperatorDashboardPage />);

    setHash('#content');
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await screen.findByTestId('content-takedown-panel')).toBeTruthy();
  });
});
