import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectUsageWarning } from '@agiworkforce/types';
import { UsageWarningBanner } from '../UsageWarningBanner';

afterEach(cleanup);

const warning = selectUsageWarning([{ bucket: 'weekly', percentRemaining: 25 }]);
const critical = selectUsageWarning([{ bucket: 'session', percentRemaining: 5 }]);

describe('UsageWarningBanner', () => {
  it('renders nothing when there is nothing to warn about', () => {
    const { container } = render(<UsageWarningBanner warning={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('names the limit in prose', () => {
    render(<UsageWarningBanner warning={warning} />);
    expect(screen.getByText("You've used 75% of your weekly limit")).toBeTruthy();
  });

  it('escalates for the binding limit when it is nearly gone', () => {
    render(<UsageWarningBanner warning={critical} />);
    const banner = screen.getByTestId('usage-warning-banner');
    expect(banner.getAttribute('data-severity')).toBe('critical');
    expect(banner.getAttribute('data-bucket')).toBe('session');
  });

  it('announces as status, not alert', () => {
    render(<UsageWarningBanner warning={warning} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders no upgrade affordance when the host passed no handler', () => {
    render(<UsageWarningBanner warning={warning} />);
    expect(screen.queryByText('Get more usage')).toBeNull();
  });

  it('renders the upgrade action when one exists', () => {
    const onUpgrade = vi.fn();
    render(<UsageWarningBanner warning={warning} onUpgrade={onUpgrade} />);
    fireEvent.click(screen.getByText('Get more usage'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('is not dismissible when the host cannot honour a dismissal', () => {
    render(<UsageWarningBanner warning={warning} />);
    expect(screen.queryByLabelText('Dismiss usage warning')).toBeNull();
  });

  it('dismisses when the host can', () => {
    const onDismiss = vi.fn();
    render(<UsageWarningBanner warning={warning} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss usage warning'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a reset line only when the server supplied an instant', () => {
    const withReset = selectUsageWarning(
      [{ bucket: 'weekly', percentRemaining: 20, resetAt: '2026-08-05T12:00:00.000Z' }],
      Date.parse('2026-08-05T09:00:00.000Z'),
    );
    render(<UsageWarningBanner warning={withReset} />);
    expect(screen.getByText('Resets in 3 hours')).toBeTruthy();
  });

  it('omits the reset line rather than inventing one', () => {
    render(<UsageWarningBanner warning={warning} />);
    expect(screen.queryByText(/Resets in/)).toBeNull();
  });

  it('truncates a long headline instead of pushing the actions out', () => {
    render(<UsageWarningBanner warning={warning} onUpgrade={() => {}} onDismiss={() => {}} />);
    const headline = screen.getByText("You've used 75% of your weekly limit");
    expect(headline.className).toContain('truncate');
    expect(headline.parentElement?.className).toContain('min-w-0');
  });
});
