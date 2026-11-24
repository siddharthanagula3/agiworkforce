import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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

vi.mock('./LocalRoutinesSection', () => ({
  LocalRoutinesSection: function LocalRoutinesSection() {
    const [draft, setDraft] = useState('');
    return (
      <input
        aria-label="Local routine draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
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

  it('keeps the local routine draft mounted while cloud billing becomes ready', () => {
    const { rerender } = render(<SchedulesPageWithProjects />);
    const draft = screen.getByRole('textbox', { name: 'Local routine draft' });
    fireEvent.change(draft, { target: { value: 'Summarize this folder' } });
    expect(schedulePageProps).not.toHaveBeenCalled();

    billing.state = {
      subscription: { tier: 'basic' },
      isLoading: false,
      initialized: true,
    };
    rerender(<SchedulesPageWithProjects />);

    expect(screen.getByRole('textbox', { name: 'Local routine draft' })).toHaveValue(
      'Summarize this folder',
    );
    expect(screen.queryByRole('status', { name: 'Loading schedule access' })).toBeNull();
    expect(schedulePageProps).toHaveBeenCalled();
  });
});
