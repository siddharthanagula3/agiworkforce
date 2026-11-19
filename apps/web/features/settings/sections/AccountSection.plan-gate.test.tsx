import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NO_PENDING_ACCOUNT_DELETION } from '@agiworkforce/cloud-contracts';
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
  subscription_source?: string;
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

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => () => ({
    userId: 'native-user-1',
    sessionId: 'session-1',
    isCurrent: () => true,
    getToken: async () => 'captured-token',
  }),
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
    async (input) =>
      new Response(
        JSON.stringify(
          String(input) === '/api/user/delete-account'
            ? NO_PENDING_ACCOUNT_DELETION
            : { sessions, totalCount: sessions.length },
        ),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  billing.subscription = null;
  billing.initialized = true;
  stubSessions();
});

describe('AccountSection delete account while a paid plan is live', () => {
  it('lets a renewing web plan be deleted and says deleting stops its renewal', async () => {
    billing.subscription = proPlan({ subscription_source: 'stripe' });
    renderAccountSection();

    const trigger = screen.getByTestId('delete-account-trigger');
    await waitFor(() => expect(trigger).toBeEnabled());
    expect(trigger).toHaveAttribute('aria-describedby', 'delete-account-hint');
    expect(screen.getByTestId('delete-account-plan-note')).toHaveTextContent(
      new RegExp(
        `Deleting stops your ${PRO_LABEL} plan renewing and ends it at erasure, not .+\\. Unused time is not refunded\\.`,
      ),
    );
    expect(screen.queryByRole('link', { name: 'Billing' })).toBeNull();
  });

  it.each([
    ['apple', 'Apple', 'https://apps.apple.com/account/subscriptions'],
    ['google', 'Google Play', 'https://play.google.com/store/account/subscriptions'],
  ])(
    'lets a renewing %s plan be deleted and says billing continues in the store',
    async (source, storeName, manageUrl) => {
      billing.subscription = proPlan({ subscription_source: source });
      renderAccountSection();

      await waitFor(() => expect(screen.getByTestId('delete-account-trigger')).toBeEnabled());
      expect(screen.getByTestId('delete-account-plan-note')).toHaveTextContent(
        `Deleting does not cancel your ${PRO_LABEL} plan. ${storeName} keeps charging until you cancel it there.`,
      );
      expect(screen.getByRole('link', { name: 'cancel it there' })).toHaveAttribute(
        'href',
        manageUrl,
      );
    },
  );

  it('lets a plan already cancelled at period end be deleted now and says what ends', async () => {
    billing.subscription = proPlan({ cancel_at_period_end: true });
    renderAccountSection();

    await waitFor(() => expect(screen.getByTestId('delete-account-trigger')).toBeEnabled());
    expect(screen.getByTestId('delete-account-plan-note')).toHaveTextContent(
      new RegExp(
        `Deleting ends your cancelled ${PRO_LABEL} plan at erasure, not .+\\. Unused time is not refunded\\.`,
      ),
    );
  });

  it('still blocks a cancelled plan whose payment is outstanding', () => {
    billing.subscription = proPlan({ status: 'past_due', cancel_at_period_end: true });
    renderAccountSection();

    expect(screen.getByTestId('delete-account-trigger')).toBeDisabled();
    expect(screen.getByTestId('delete-account-plan-note')).toHaveTextContent(
      `A ${PRO_LABEL} payment is still being collected.`,
    );
  });

  it('blocks a past-due paid plan as the server does', () => {
    billing.subscription = proPlan({ status: 'past_due', subscription_source: 'stripe' });
    renderAccountSection();

    const trigger = screen.getByTestId('delete-account-trigger');
    expect(trigger).toBeDisabled();
    expect(trigger.style.color).toBe('var(--text-disabled)');
    expect(screen.getByTestId('delete-account-plan-note')).toHaveTextContent(
      `A ${PRO_LABEL} payment is still being collected.`,
    );
  });

  it('keeps Delete open on the Free plan with the scheduling note', async () => {
    billing.subscription = {
      tier: 'free',
      display_name: 'Free',
      status: 'active',
      current_period_end: null,
    };
    renderAccountSection();

    await waitFor(() => expect(screen.getByTestId('delete-account-trigger')).toBeEnabled());
    expect(screen.queryByTestId('delete-account-plan-note')).toBeNull();
    expect(screen.getByText(/Schedule permanent account deletion/)).toBeTruthy();
  });

  it('keeps Delete open once a paid plan has ended', async () => {
    billing.subscription = proPlan({ status: 'canceled' });
    renderAccountSection();

    await waitFor(() => expect(screen.getByTestId('delete-account-trigger')).toBeEnabled());
  });

  it('holds Delete until the plan has been read', () => {
    billing.initialized = false;
    renderAccountSection();

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
    renderAccountSection();

    const header = await screen.findByRole('columnheader', { name: 'Device' });
    expect(header.style.fontSize).toBe('14px');
    expect(header.style.fontWeight).toBe('400');
    expect(header.style.textTransform).toBe('');
    await waitFor(() => expect(screen.getByRole('table').style.fontSize).toBe('14px'));
  });
});

function renderAccountSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountSection />
    </QueryClientProvider>,
  );
}

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
