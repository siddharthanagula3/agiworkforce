import type { ReactNode } from 'react';
import { cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, vi } from 'vitest';

type NativeSession = {
  id: string;
  user: { id: string };
  getToken: (options?: { skipCache?: boolean }) => Promise<string>;
  startVerification: (options: { level: string }) => Promise<unknown>;
  attemptSecondFactorVerification: (options: {
    strategy: string;
    code: string;
  }) => Promise<unknown>;
};

const fixture = vi.hoisted(() => ({
  serial: 0,
  accountId: '',
  auth: { isLoaded: true, isSignedIn: true, userId: '', sessionId: '' },
  listeners: new Set<() => void>(),
  sdk: {
    loaded: true,
    user: { id: '' },
    session: null as NativeSession | null,
    addListener:
      (_listener: () => void): (() => void) =>
      () =>
        undefined,
  },
  navigate: vi.fn(),
  finalize: vi.fn(),
  applyCacheScope: vi.fn(async () => true),
  success: vi.fn(),
  error: vi.fn(),
}));

export { fixture };

vi.mock('@clerk/nextjs', async (original) => ({
  ...(await original()),
  useAuth: () => fixture.auth,
  useClerk: () => fixture.sdk,
  useSession: () => ({ isLoaded: true, session: fixture.sdk.session }),
}));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<typeof import('@/lib/client/csrf')>()),
  getCsrfToken: vi.fn(async () => 'captured-csrf'),
}));
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@shared/stores/authentication-store', async (original) => ({
  ...(await original<typeof import('@shared/stores/authentication-store')>()),
  applyCacheScope: fixture.applyCacheScope,
}));
vi.mock('@/features/workspaces/lib/workspace-cache-scope', async (original) => {
  const actual = await original<typeof import('@/features/workspaces/lib/workspace-cache-scope')>();
  return {
    ...actual,
    finalizeWorkspaceSwitch: (...args: Parameters<typeof actual.finalizeWorkspaceSwitch>) => {
      fixture.finalize(...args);
      return actual.finalizeWorkspaceSwitch(args[0], args[1], args[2], fixture.navigate, args[4]);
    },
  };
});

import { getCsrfToken } from '@/lib/client/csrf';
import { MANAGED_CLOUD_WORKSPACES_PATH } from '@agiworkforce/cloud-contracts';
export { getCsrfToken } from '@/lib/client/csrf';
export { useLeaveOrganization, useTransferOrganizationOwnership } from '../use-settings-queries';

export const ORG = '11111111-1111-4111-8111-111111111111';
export const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
export const LEAVE_PATH = '/api/settings/organization/leave';
export const TRANSFER_PATH = '/api/settings/organization/transfer-ownership';
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
export const workspace = (organizationId: string | null = ORG) => ({
  accountId: fixture.accountId,
  workspaces: organizationId
    ? [
        {
          id: `workspace:${organizationId}`,
          organizationId,
          kind: 'organization',
          name: 'Research',
          slug: 'research',
          isPrimary: true,
          role: 'owner',
        },
      ]
    : [],
  activeWorkspaceId: organizationId ? `workspace:${organizationId}` : null,
  activeOrganizationId: organizationId,
  scope: organizationId ? 'organization' : 'personal',
});
export const leaveReceipt = (successorUserId: string | null = null) => ({
  organizationId: ORG,
  userId: fixture.accountId,
  successorUserId,
  revoked: { sessions: 0, deviceTokens: 0, apiKeys: 0 },
  sharedConnectorsUnshared: 0,
  warnings: [] as string[],
});
export const transferReceipt = () => ({
  organizationId: ORG,
  ownerUserId: 'successor',
  previousOwnerRole: 'viewer',
});
export const challenge = () =>
  json(
    {
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action: 'organization.transfer_ownership',
          consequence: 'Ownership moves to another member.',
          freshnessSeconds: 300,
        },
      },
    },
    403,
  );
export const verification = () =>
  json(
    {
      error: {
        code: 'STEP_UP_VERIFICATION_REQUIRED',
        details: { level: 'second_factor' },
        message: 'Confirm it is you.',
      },
    },
    403,
  );
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export const fetchMock = vi.fn<typeof fetch>();
export const reads = () =>
  fetchMock.mock.calls.filter(([path]) => String(path) === MANAGED_CLOUD_WORKSPACES_PATH);
export const writes = () =>
  fetchMock.mock.calls.filter(([path]) => [LEAVE_PATH, TRANSFER_PATH].includes(String(path)));
export const grants = () =>
  fetchMock.mock.calls.filter(([path]) => String(path) === '/api/auth/step-up');
export let client: QueryClient;
export const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

export function identity(
  userId = `membership-user-${++fixture.serial}`,
  sessionId = `session-${fixture.serial}`,
) {
  fixture.accountId = `product-account-${userId}`;
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: vi.fn(async (options?: { skipCache?: boolean }) =>
      options?.skipCache ? 'fresh-token' : 'captured-token',
    ),
    startVerification: vi.fn(async () => ({ status: 'complete' })),
    attemptSecondFactorVerification: vi.fn(async () => ({ status: 'complete' })),
  };
  for (const listener of [...fixture.listeners]) listener();
}

export function transport(write: (path: string, init?: RequestInit) => Promise<Response>) {
  fetchMock.mockImplementation(async (path, init) =>
    String(path) === MANAGED_CLOUD_WORKSPACES_PATH ? json(workspace()) : write(String(path), init),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.listeners.clear();
  fixture.sdk.addListener = (listener) => {
    fixture.listeners.add(listener);
    listener();
    return () => {
      fixture.listeners.delete(listener);
    };
  };
  identity();
  fixture.applyCacheScope.mockReset().mockResolvedValue(true);
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('captured-csrf');
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 3, retryDelay: 0 },
    },
  });
  fetchMock.mockReset();
  transport(async (path) => json(path === LEAVE_PATH ? leaveReceipt() : transferReceipt()));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  fixture.listeners.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
