import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const billing = vi.hoisted(() => ({
  state: {
    subscription: null as { tier: string } | null,
    isLoading: true,
    initialized: false,
  },
}));
const schedulePageProps = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/projects', () => ({
  useManagedCloudProjects: () => ({ projects: [] }),
}));

vi.mock('@/shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: typeof billing.state) => unknown) => selector(billing.state),
}));

vi.mock('./SchedulesPage', () => ({
  SchedulesPage: (props: unknown) => {
    schedulePageProps(props);
    return <button type="button">Upgrade plan</button>;
  },
}));

import { SchedulesPageWithProjects } from './SchedulesPageWithProjects';

beforeEach(() => {
  billing.state = { subscription: null, isLoading: true, initialized: false };
  schedulePageProps.mockClear();
});

describe('SchedulesPageWithProjects billing hydration', () => {
  it('does not present a false Free-plan upgrade while billing is unresolved', () => {
    render(<SchedulesPageWithProjects />);

    expect(screen.getByRole('status', { name: 'Loading schedule access' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade plan' })).toBeNull();
    expect(schedulePageProps).not.toHaveBeenCalled();
  });

  it('renders schedules with the resolved subscription tier', () => {
    billing.state = {
      subscription: { tier: 'enterprise' },
      isLoading: false,
      initialized: true,
    };

    render(<SchedulesPageWithProjects />);

    expect(schedulePageProps).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionTier: 'enterprise' }),
    );
  });
});
