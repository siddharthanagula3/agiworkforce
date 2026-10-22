import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { AccountSection } from './AccountSection';

interface MockSubscription {
  tier: string;
  display_name: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end?: boolean;
}

const billing = vi.hoisted(() => ({
  subscription: null as MockSubscription | null,
  initialized: true,
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({ subscription: billing.subscription, initialized: billing.initialized }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-1' }, logout: vi.fn() }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

vi.mock('../components/Settings/ApiKeys', () => ({
  ApiKeysManager: () => <div>Scoped API key manager</div>,
}));

vi.mock('../hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useUserActivity: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useOrganizationOverview: () => ({ data: undefined }),
  useDeleteAccount: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    error: null,
    data: undefined,
    signOutAfterDeletion: vi.fn(async () => {}),
  }),
  useAccountDeletionStatus: () => ({
    data: { pending: false, canCancel: false, requestedAt: null, scheduledFor: null },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCancelAccountDeletion: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

const PRO_LABEL = getBillingPlanPricing('pro').label;

function proPlan(overrides: Partial<MockSubscription> = {}): MockSubscription {
  return {
    tier: 'pro',
    display_name: PRO_LABEL,
    status: 'active',
    current_period_end: 1_800_000_000,
    cancel_at_period_end: false,
    ...overrides,
  };
}

function stubSessions(sessions: unknown[] = []): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ sessions, totalCount: sessions.length }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  billing.subscription = null;
  billing.initialized = true;
  stubSessions();
});

describe('AccountSection delete account while a paid plan is live', () => {
  it('disables Delete and tells the user to cancel the plan in Billing first', () => {
    billing.subscription = proPlan();
    render(<AccountSection />);

    const trigger = screen.getByTestId('delete-account-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger.style.color).toBe('var(--text-disabled)');
    expect(trigger).toHaveAttribute('aria-describedby', 'delete-account-hint');
    const note = screen.getByTestId('delete-account-plan-note');
    expect(note).toHaveTextContent(
      `Cancel your ${PRO_LABEL} plan in Billing before deleting your account.`,
    );
    expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute(
      'href',
      expect.stringContaining('billing'),
    );
    expect(screen.queryByText(/Deletion is scheduled for 24 hours later/)).toBeNull();
  });

  it('says when a plan already cancelled at period end stops blocking deletion', () => {
    billing.subscription = proPlan({ cancel_at_period_end: true });
    render(<AccountSection />);

    expect(screen.getByTestId('delete-account-trigger')).toBeDisabled();
    expect(screen.getByTestId('delete-account-plan-note')).toHaveTextContent(
      new RegExp(`You can delete your account once your ${PRO_LABEL} plan ends on .+\\.`),
    );
  });

  it('blocks a past-due paid plan as the server does', () => {
    billing.subscription = proPlan({ status: 'past_due' });
    render(<AccountSection />);

    expect(screen.getByTestId('delete-account-trigger')).toBeDisabled();
  });

  it('keeps Delete open on the Free plan with the scheduling note', () => {
    billing.subscription = {
      tier: 'free',
      display_name: 'Free',
      status: 'active',
      current_period_end: null,
    };
    render(<AccountSection />);

    expect(screen.getByTestId('delete-account-trigger')).toBeEnabled();
    expect(screen.queryByTestId('delete-account-plan-note')).toBeNull();
    expect(screen.getByText(/Deletion is scheduled for 24 hours later/)).toBeTruthy();
  });

  it('keeps Delete open once a paid plan has ended', () => {
    billing.subscription = proPlan({ status: 'canceled' });
    render(<AccountSection />);

    expect(screen.getByTestId('delete-account-trigger')).toBeEnabled();
  });

  it('holds Delete until the plan has been read', () => {
    billing.initialized = false;
    render(<AccountSection />);

    expect(screen.getByTestId('delete-account-trigger')).toBeDisabled();
  });
});

describe('AccountSection active sessions type scale', () => {
  it('sets the session table headers at 14px regular, not small uppercase', async () => {
    stubSessions([
      {
        id: 'sess_1',
        status: 'active',
        device: 'Mac',
        browser: 'Chrome',
        location: 'Austin, US',
        createdAt: '2026-07-01T10:00:00.000Z',
        lastActiveAt: '2026-07-04T10:00:00.000Z',
        expiresAt: null,
        isCurrent: true,
      },
    ]);
    render(<AccountSection />);

    const header = await screen.findByRole('columnheader', { name: 'Device' });
    expect(header.style.fontSize).toBe('14px');
    expect(header.style.fontWeight).toBe('400');
    expect(header.style.textTransform).toBe('');
    await waitFor(() => expect(screen.getByRole('table').style.fontSize).toBe('14px'));
  });
});
