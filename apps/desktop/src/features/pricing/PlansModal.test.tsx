import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../stores/auth';
import { PlansModal } from './PlansModal';

vi.mock('./PlanCard', () => ({
  PlanCard: ({ tier, isCurrentPlan }: { tier: string; isCurrentPlan: boolean }) => (
    <div data-testid={`plan-${tier}`}>{isCurrentPlan ? 'current' : 'not-current'}</div>
  ),
}));

describe('PlansModal account plan ownership', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      plan: 'pro',
      planDisplayName: 'Pro',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('marks the backend-owned account plan as current', () => {
    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('plan-pro')).toHaveTextContent(/^current$/);
    expect(screen.getByTestId('plan-byok')).toHaveTextContent(/^not-current$/);
  });

  it('maps the canonical local-only account tier to the Local plan', () => {
    useAuthStore.setState({ plan: 'local-only', planDisplayName: 'Local Mode' });

    render(<PlansModal open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('plan-local')).toHaveTextContent(/^current$/);
    expect(screen.getByTestId('plan-byok')).toHaveTextContent(/^not-current$/);
  });

  it('lets Radix own the accessible title and description ids', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<PlansModal open onOpenChange={vi.fn()} />);

    const diagnostics = [...error.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(diagnostics).not.toMatch(/requires a `DialogTitle`|Missing `Description`/);

    error.mockRestore();
    warn.mockRestore();
  });
});
