import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockRedirect, mockGetUser, mockAssertAccountActive, mockRequireTerms } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockRedirect: vi.fn(),
    mockGetUser: vi.fn(),
    mockAssertAccountActive: vi.fn(),
    mockRequireTerms: vi.fn(),
  }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: async () => ({ users: { getUser: (...args: unknown[]) => mockGetUser(...args) } }),
}));

vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: (...args: unknown[]) => mockAssertAccountActive(...args),
}));

vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) => mockRequireTerms(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`NEXT_REDIRECT:${destination}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    mockRedirect(destination);
    throw new RedirectSignal(destination);
  },
}));

vi.mock('@/features/admin', () => ({
  AdminConsolePage: () => 'admin console body',
}));

import AdminPage from '../page';
import AdminLayout from '../layout';
import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';

const OPERATOR_ID = 'user_platform_operator_1';
const ORG_OWNER_ID = 'user_org_owner_1';

const originalAllowlist = process.env[PLATFORM_ADMIN_ENV_VAR];

async function renderPage(): Promise<{ redirectedTo: string | null; rendered: unknown }> {
  try {
    return { redirectedTo: null, rendered: await AdminPage() };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirectedTo: error.destination, rendered: null };
    throw error;
  }
}

async function renderLayout(): Promise<{ redirectedTo: string | null; rendered: unknown }> {
  try {
    return { redirectedTo: null, rendered: await AdminLayout({ children: 'admin segment' }) };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirectedTo: error.destination, rendered: null };
    throw error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;
  mockRequireTerms.mockResolvedValue(undefined);
  mockAssertAccountActive.mockResolvedValue(undefined);
  mockGetUser.mockResolvedValue({ publicMetadata: {} });
});

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];
  } else {
    process.env[PLATFORM_ADMIN_ENV_VAR] = originalAllowlist;
  }
});

describe('/admin console platform-operator gate', () => {
  it('sends an org owner home instead of rendering panels that all answer 404', async () => {
    mockAuth.mockResolvedValue({ userId: ORG_OWNER_ID });

    const { redirectedTo, rendered } = await renderPage();

    expect(redirectedTo).toBe('/');
    expect(rendered).toBeNull();
  });

  it('sends everyone home when no operator allowlist is configured', async () => {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];
    mockAuth.mockResolvedValue({ userId: OPERATOR_ID });

    expect((await renderPage()).redirectedTo).toBe('/');
  });

  it('sends a signed-out visitor home rather than rendering the console', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    expect((await renderPage()).redirectedTo).toBe('/');
  });

  it('renders the console for an allowlisted platform operator', async () => {
    mockAuth.mockResolvedValue({ userId: OPERATOR_ID });

    const { redirectedTo, rendered } = await renderPage();

    expect(redirectedTo).toBeNull();
    expect(rendered).not.toBeNull();
  });
});

describe('/admin segment layout admits operators and org admins', () => {
  it('lets an allowlisted operator with no organisation role through to the console', async () => {
    mockAuth.mockResolvedValue({ userId: OPERATOR_ID });
    mockGetUser.mockResolvedValue({ publicMetadata: { role: 'member' } });

    const { redirectedTo, rendered } = await renderLayout();

    expect(redirectedTo).toBeNull();
    expect(rendered).toBe('admin segment');
  });

  it('keeps the org-scoped pages reachable for an org owner who is not an operator', async () => {
    mockAuth.mockResolvedValue({ userId: ORG_OWNER_ID });
    mockGetUser.mockResolvedValue({ publicMetadata: { role: 'owner' } });

    const { redirectedTo, rendered } = await renderLayout();

    expect(redirectedTo).toBeNull();
    expect(rendered).toBe('admin segment');
  });

  it('sends away a caller who is neither an operator nor an org admin', async () => {
    mockAuth.mockResolvedValue({ userId: ORG_OWNER_ID });
    mockGetUser.mockResolvedValue({ publicMetadata: { role: 'member' } });

    expect((await renderLayout()).redirectedTo).toBe('/');
  });

  it('sends away an operator whose own account is suspended', async () => {
    mockAuth.mockResolvedValue({ userId: OPERATOR_ID });
    mockAssertAccountActive.mockRejectedValue(new Error('suspended'));

    expect((await renderLayout()).redirectedTo).toBe('/');
  });

  it('sends a signed-out visitor to login', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    expect((await renderLayout()).redirectedTo).toBe('/login?redirectTo=/admin');
  });
});
