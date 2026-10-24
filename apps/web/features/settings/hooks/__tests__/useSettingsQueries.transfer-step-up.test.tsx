import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const reverification = vi.hoisted(() => ({
  start: vi.fn(),
  sendEmailCode: vi.fn(),
  verifyPassword: vi.fn(),
  verifyEmailCode: vi.fn(),
  verifyPasskey: vi.fn(),
  verifySecondFactor: vi.fn(),
  freshToken: vi.fn(),
}));

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
vi.mock('@/lib/identity/client', () => ({
  useSessionReverification: () => reverification,
  useSignOut: () => vi.fn(),
  signedOutRedirectUrl: (redirectUrl: string | undefined) => redirectUrl,
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
        message: 'Confirm it is you before completing this action.',
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

function verificationRequired() {
  return new Response(
    JSON.stringify({
      error: {
        code: 'STEP_UP_VERIFICATION_REQUIRED',
        message: 'Confirm it is you with your authenticator app or a backup code.',
        details: { action: 'organization.transfer_ownership', level: 'second_factor' },
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
  reverification.start.mockResolvedValue({
    kind: 'second_factor',
    methods: ['authenticator', 'backup_code'],
  });
  reverification.verifySecondFactor.mockResolvedValue({ kind: 'complete' });
  reverification.freshToken.mockResolvedValue('fresh-session-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTransferOrganizationOwnership step-up', () => {
  it('asks for the second factor, then replays the transfer with the proof', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(verificationRequired())
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(jsonOk({ ownerUserId: 'successor' }));

    renderHarness();
    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));

    expect(await screen.findByText(CONSEQUENCE)).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/code from your authenticator app/i), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Ownership transferred.'));
    expect(reverification.start).toHaveBeenCalledWith('second_factor');
    expect(reverification.verifySecondFactor).toHaveBeenCalledWith('authenticator', '123456');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/settings/organization/transfer-ownership');
    const headers = (fetchMock.mock.calls[3]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers[STEP_UP_TOKEN_HEADER]).toBe('grant.signature');
  });

  it('binds the proof to the workspace and asks for it with the re-verified session', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(verificationRequired())
      .mockResolvedValueOnce(jsonOk({ token: 'grant.signature' }))
      .mockResolvedValueOnce(jsonOk({ ownerUserId: 'successor' }));

    renderHarness();
    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));
    await user.type(await screen.findByLabelText(/code from your authenticator app/i), '123456');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/auth/step-up');
    const grantRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(grantRequest.body as string)).toEqual({
      action: 'organization.transfer_ownership',
      resourceId: ORG,
    });
    expect((grantRequest.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer fresh-session-token',
    );
  });

  it('transfers nothing, and raises no alarm, when the challenge is dismissed', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(refusal()).mockResolvedValueOnce(verificationRequired());

    renderHarness();
    await user.click(screen.getByRole('button', { name: /transfer ownership/i }));
    await user.click(await screen.findByRole('button', { name: /^cancel$/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/code from your authenticator app/i)).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('That member has left.'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
