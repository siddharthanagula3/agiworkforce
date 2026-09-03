import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const hookState = {
  usage: null as unknown,
  loading: false,
  error: null as string | null,
  lastUpdatedAt: null as Date | null,
  stale: false,
  refresh: vi.fn(),
};
vi.mock('@/lib/hooks/useManagedUsageSummary', () => ({
  useManagedUsageSummary: () => hookState,
}));
vi.mock('@shared/stores/web-auth-store', () => ({
  // The component selects, so the mock has to honour the selector.
  useBillingStore: (selector: (s: unknown) => unknown) =>
    selector({ subscription: { tier: 'pro' } }),
}));

import { UsageSection } from '../UsageSection';

beforeEach(() => {
  hookState.usage = null;
  hookState.loading = false;
  hookState.error = null;
});

describe('usage bars when the server figure cannot be read', () => {
  it('does not claim a full allowance when the fetch failed', () => {
    hookState.error = 'Could not load usage.';
    render(<UsageSection />);
    expect(screen.queryByText(/100% left/i)).toBeNull();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });

  it('does not claim a full allowance while still loading', () => {
    hookState.loading = true;
    render(<UsageSection />);
    expect(screen.queryByText(/100% left/i)).toBeNull();
  });

  it('marks the bars unavailable to assistive tech, not merely visually', () => {
    render(<UsageSection />);
    expect(screen.getAllByLabelText(/usage unavailable/i).length).toBeGreaterThan(0);
  });
});
