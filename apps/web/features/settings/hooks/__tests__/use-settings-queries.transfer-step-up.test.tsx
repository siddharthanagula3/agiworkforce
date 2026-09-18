import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import { useTransferOrganizationOwnership } from '../use-settings-queries';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONSEQUENCE = 'Ownership of this workspace moves to another member.';

const fetchMock = vi.fn();

function refusal() {
  return new Response(
    JSON.stringify({
      error: {
        code: 'STEP_UP_REQUIRED',
        message: 'Confirm it is you with a second factor before completing this action.',
        details: {
          reason: 'step_up_required',
          action: 'organization.transfer_ownership',
          consequence: CONSEQUENCE,
          freshnessSeconds: 300,
        },
      },
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  );
}

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function Harness() {
  const transfer = useTransferOrganizationOwnership();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          transfer.mutate({
            organizationId: ORG,
            toUserId: 'successor',
            outgoingOwnerRole: 'admin',
          })
        }
      >
        Transfer ownership
      </button>
      {transfer.stepUpDialog}
    </>
  );
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTransferOrganizationOwnership step-up', () => {
  it('turns the route refusal into a challenge and replays the transfer with the proof', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(jsonOk({ ownerUserId: 'successor' }));

    renderHarness();
    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));

    expect(await screen.findByText(CONSEQUENCE)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Authenticator or backup code/i), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Ownership transferred.'));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/settings/organization/transfer-ownership');
    const headers = (fetchMock.mock.calls[2]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers[STEP_UP_TOKEN_HEADER]).toBe('grant.signature');
  });

  it('binds the proof to the workspace being transferred', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(jsonOk({ ownerUserId: 'successor' }));

    renderHarness();
    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));
    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/step-up');
    expect(JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string)).toEqual({
      action: 'organization.transfer_ownership',
      code: '123456',
      resourceId: ORG,
    });
  });

  it('transfers nothing, and raises no alarm, when the challenge is dismissed', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(refusal());

    renderHarness();
    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));
    await user.click(await screen.findByRole('button', { name: /^cancel$/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/Authenticator or backup code/i)).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('reports a genuine failure of the replayed transfer', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'That member has left.' } }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      );

    renderHarness();
    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));
    await user.type(await screen.findByLabelText(/Authenticator or backup code/i), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('That member has left.'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
